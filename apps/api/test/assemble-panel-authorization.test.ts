// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * QA-DEF / AI assembly: доказательство, что авторизация завершается ДО
 * LLM / calc-engine / storage / DB write.
 *
 * Вызов контроллера выполняется напрямую (минуя HTTP guard'ы), чтобы
 * проверить defense in depth на уровне сервиса и_ORDER effects.
 */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../src/auth/auth.service.js';
import { PanelArchitectAgent } from '../src/agents/panel-architect.agent.js';
import { CopilotChatAgent } from '../src/agents/copilot-chat.agent.js';
import { PueAuditorAgent } from '../src/agents/pue-auditor.agent.js';
import { CalcEngineClient } from '../src/calc-engine/calc-engine.client.js';
import { DRIZZLE_DB, type Database } from '../src/database/drizzle.provider.js';
import { schema } from '../src/database/schema.js';
import { ProjectPolicyService } from '../src/policy/project-policy.service.js';
import { ProjectsController } from '../src/projects/projects.controller.js';
import { ProjectsService } from '../src/projects/projects.service.js';
import { FLOOR_PLAN_STORAGE } from '../src/projects/storage/floor-plan-storage.js';
import type { FloorPlanStorage } from '../src/projects/storage/floor-plan-storage.js';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEmptyProjectGraph } from '@voltwirecraft/shared/graph.schema.js';

const migrationsFolder = fileURLToPath(new URL('../src/database/migrations', import.meta.url));
const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const ENGINEER_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const OUTSIDER_ID = '44444444-4444-4444-8444-444444444444';
const PASSWORD_HASH = '00'.repeat(16) + ':' + '11'.repeat(64);

interface Journal {
  readonly entries: readonly { readonly tag: string }[];
}

async function applyMigrationsAsync(client: PGlite): Promise<void> {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')) as Journal;
  for (const entry of journal.entries) {
    const sql = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (/vector/i.test(statement) || /normative_chunks/.test(statement)) {
        continue;
      }
      await client.exec(statement);
    }
  }
}

function identity(id: string): AuthUser {
  return { id, email: `${id}@example.test`, displayName: id, role: 'user' };
}

describe('AI assembly — authorization before side effects', () => {
  let client: PGlite;
  let controller: ProjectsController;
  let projects: ProjectsService;
  let llmOrCalc: ReturnType<typeof vi.fn>;
  let storage: ReturnType<typeof vi.fn>;

  async function snapshotAsync(): Promise<string> {
    const tables = ['users', 'projects', 'project_members', 'project_comments', 'floor_plans'];
    const result: Record<string, unknown> = {};
    for (const table of tables) {
      result[table] = (await client.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
    }
    return JSON.stringify(result);
  }

  beforeAll(async () => {
    client = new PGlite();
    await applyMigrationsAsync(client);
    const db = drizzle(client, { schema });

    llmOrCalc = vi.fn(async () => ({
      graph: createEmptyProjectGraph('A', PROJECT_ID),
      explanation: 'ok',
      toolCalls: [],
      panel: {},
    }));
    storage = vi.fn(async () => undefined);

    const module = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        ProjectsService,
        ProjectPolicyService,
        { provide: DRIZZLE_DB, useValue: db as unknown as Database },
        { provide: FLOOR_PLAN_STORAGE, useValue: { saveAsync: storage } as unknown as FloorPlanStorage },
        {
          provide: CalcEngineClient,
          useValue: {
            calculateCableLengthAsync: vi.fn(async () => ({ lengthM: 1 })),
            autoAssemblePanelAsync: llmOrCalc,
          },
        },
        { provide: PanelArchitectAgent, useValue: { assembleAsync: llmOrCalc } },
        { provide: CopilotChatAgent, useValue: { chatAsync: vi.fn() } },
        { provide: PueAuditorAgent, useValue: { auditAsync: vi.fn() } },
      ],
    }).compile();

    controller = module.get(ProjectsController);
    projects = module.get(ProjectsService);

    await db.insert(schema.users).values([
      { id: OWNER_ID, email: 'o@t.test', passwordHash: PASSWORD_HASH, fullName: 'Owner' },
      { id: ENGINEER_ID, email: 'e@t.test', passwordHash: PASSWORD_HASH, fullName: 'Engineer' },
      { id: CLIENT_ID, email: 'c@t.test', passwordHash: PASSWORD_HASH, fullName: 'Client' },
      { id: OUTSIDER_ID, email: 'x@t.test', passwordHash: PASSWORD_HASH, fullName: 'Outsider' },
    ]);
    await db.insert(schema.projects).values({
      id: PROJECT_ID,
      title: 'A',
      objectType: 'house',
      networkSystem: 'tn-s',
      graphJson: createEmptyProjectGraph('A', PROJECT_ID),
      ownerId: OWNER_ID,
    });
    await db.insert(schema.projectMembers).values([
      { projectId: PROJECT_ID, userId: ENGINEER_ID, role: 'engineer' },
      { projectId: PROJECT_ID, userId: CLIENT_ID, role: 'client' },
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  const dto = { preferredBrand: 'IEK' } as Parameters<ProjectsController['assemblePanelAsync']>[1];

  it('outsider → 404, LLM/calc=0, storage=0, DB write=0', async () => {
    const before = await snapshotAsync();
    const write = vi.spyOn(projects, 'updateGraphAsync');

    await expect(controller.assemblePanelAsync(PROJECT_ID, dto, identity(OUTSIDER_ID))).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(llmOrCalc).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(await snapshotAsync()).toBe(before);
    write.mockRestore();
  });

  it('client → 403, LLM/calc=0, storage=0, DB write=0', async () => {
    const before = await snapshotAsync();
    const write = vi.spyOn(projects, 'updateGraphAsync');

    await expect(controller.assemblePanelAsync(PROJECT_ID, dto, identity(CLIENT_ID))).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(llmOrCalc).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(await snapshotAsync()).toBe(before);
    write.mockRestore();
  });

  it.each([
    ['engineer', ENGINEER_ID],
    ['owner', OWNER_ID],
  ])('%s → разрешено, LLM/calc и DB write вызваны', async (_name, userId) => {
    vi.mocked(llmOrCalc).mockClear();
    const write = vi.spyOn(projects, 'updateGraphAsync');

    const response = await controller.assemblePanelAsync(PROJECT_ID, dto, identity(userId));

    expect(response.success).toBe(true);
    expect(llmOrCalc).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });
});
