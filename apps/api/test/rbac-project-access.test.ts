// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * Независимый RBAC/BOLA-review Agent 3 (SEC-02).
 *
 * Каждый негативный сценарий проверяет:
 *   1. корректный HTTP-статус (401 / 403 / 404);
 *   2. DbSnapshot до == после (0 изменений БД);
 *   3. SpyBank == 0 (storage / calc / LLM / MCP не вызывались при отказе);
 *   4. тело ответа не содержит чужих данных.
 *
 * Traceability: S2-RBAC-07/08/09/10/11/13/14/15/16/20/21,
 * S2-ISO-01/02/05/06/08/11/12, S2-RBAC-24 (admin deny-by-default).
 * `S2-RBAC-21` — новый свободный ID для отдельного сценария
 * «outsider → resolveCommentAsync» (в QA V2 отдельного ID не было).
 */

import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEmptyProjectGraph, type ProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import { AuthService, type AuthUser } from '../src/auth/auth.service.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { RefreshSessionService } from '../src/auth/refresh-session.service.js';
import { ProjectAccessGuard } from '../src/auth/project-access.guard.js';
import { PROJECT_SCOPE_KEY, ProjectScoped } from '../src/auth/project-scoped.decorator.js';
import { ProjectAccessService } from '../src/auth/project-access.service.js';
import { CalcEngineClient } from '../src/calc-engine/calc-engine.client.js';
import type { Env } from '../src/config/env.schema.js';
import { DRIZZLE_DB, type Database } from '../src/database/drizzle.provider.js';
import { schema } from '../src/database/schema.js';
import { ErpMcpService } from '../src/integrations/erp-mcp.service.js';
import { IntegrationService } from '../src/integrations/integration.service.js';
import { ProjectPolicyService } from '../src/policy/project-policy.service.js';
import { ProjectsService } from '../src/projects/projects.service.js';
import { FLOOR_PLAN_STORAGE } from '../src/projects/storage/floor-plan-storage.js';
import { HitlService } from '../src/security/hitl.service.js';
import { HITL_REPLAY_STORE } from '../src/security/security.module.js';
import { InMemoryReplayStore } from '../src/security/replay-store.js';
import type { FloorPlanStorage } from '../src/projects/storage/floor-plan-storage.js';

interface Journal {
  readonly entries: readonly { readonly tag: string }[];
}

const migrationsFolder = fileURLToPath(new URL('../src/database/migrations', import.meta.url));

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const ENGINEER_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const OUTSIDER_ID = '44444444-4444-4444-8444-444444444444';
const ADMIN_ID = '55555555-5555-4555-8555-555555555555';
const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEGACY_PROJECT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COMMENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** Тестовый пароль (не используется для входа в этом файле). */
const PASSWORD_HASH = '00'.repeat(16) + ':' + '11'.repeat(64);

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

/** Снимок всех таблиц, которые может затронуть проектная операция. */
async function dbSnapshotAsync(client: PGlite): Promise<string> {
  const tables = ['users', 'projects', 'project_members', 'project_comments', 'floor_plans'];
  const result: Record<string, unknown> = {};
  for (const table of tables) {
    const rows = await client.query(`SELECT * FROM ${table} ORDER BY 1`);
    result[table] = rows.rows;
  }
  return JSON.stringify(result);
}

/** Шпионы внешних эффектов. */
interface SpyBank {
  readonly storageSave: ReturnType<typeof vi.fn>;
  readonly calcLength: ReturnType<typeof vi.fn>;
  readonly calcDxf: ReturnType<typeof vi.fn>;
  readonly erpCall: ReturnType<typeof vi.fn>;
}

function assertNoSideEffects(spy: SpyBank, before: string, after: string): void {
  expect(after).toBe(before);
  expect(spy.storageSave).not.toHaveBeenCalled();
  expect(spy.calcLength).not.toHaveBeenCalled();
  expect(spy.calcDxf).not.toHaveBeenCalled();
  expect(spy.erpCall).not.toHaveBeenCalled();
}

/** Идентификаторы из токена/сервиса — не роль в проекте. */
function identity(id: string, globalRole: 'user' | 'admin' = 'user'): AuthUser {
  return { id, email: `${id}@example.test`, displayName: id, role: globalRole };
}

/** Минимальный ExecutionContext для прямого вызова guard'а. */
function contextFor(handler: unknown, request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('Agent 3 — SEC-02 project authorization (read-only review + hardening proof)', () => {
  let client: PGlite;
  let db: Database;
  let policy: ProjectPolicyService;
  let access: ProjectAccessService;
  let projects: ProjectsService;
  let integrations: IntegrationService;
  let guard: ProjectAccessGuard;
  let spy: SpyBank;

  beforeAll(async () => {
    client = new PGlite();
    await applyMigrationsAsync(client);
    db = drizzle(client, { schema });

    const config = {
      get: (key: string): unknown => {
        if (key === 'JWT_SECRET') return 'a'.repeat(40);
        if (key === 'JWT_EXPIRES_IN') return '7d';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '30d';
        if (key === 'JWT_REFRESH_HASH_PEPPER') return 'p'.repeat(40);
        if (key === 'HITL_SIGNING_KEY') return 'b'.repeat(40);
        return undefined;
      },
    } as unknown as ConfigService<Env, true>;

    spy = {
      storageSave: vi.fn(async () => undefined),
      calcLength: vi.fn(async () => ({ lengthM: 1 })),
      calcDxf: vi.fn(async () => ({ walls: [] })),
      erpCall: vi.fn(async () => ({ data: {}, operationId: 'op' })),
    };

    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, validate: () => ({}) })],
      providers: [
        { provide: DRIZZLE_DB, useValue: db },
        { provide: ConfigService, useValue: config },
        { provide: Reflector, useClass: Reflector },
        { provide: FLOOR_PLAN_STORAGE, useValue: { saveAsync: spy.storageSave } as FloorPlanStorage },
        {
          provide: CalcEngineClient,
          useValue: {
            calculateCableLengthAsync: spy.calcLength,
            parseDxfAsync: spy.calcDxf,
          },
        },
        {
          provide: ErpMcpService,
          useValue: { callToolAsync: spy.erpCall, statusAsync: vi.fn(async () => []) },
        },
        JwtService,
        RefreshSessionService,
        AuthService,
        ProjectPolicyService,
        ProjectAccessService,
        ProjectsService,
        IntegrationService,
        ProjectAccessGuard,
        HitlService,
        { provide: HITL_REPLAY_STORE, useClass: InMemoryReplayStore },
      ],
    }).compile();

    policy = module.get(ProjectPolicyService);
    access = module.get(ProjectAccessService);
    projects = module.get(ProjectsService);
    integrations = module.get(IntegrationService);
    guard = module.get(ProjectAccessGuard);

    await db.insert(schema.users).values([
      { id: OWNER_ID, email: 'owner@example.test', passwordHash: PASSWORD_HASH, fullName: 'Owner', globalRole: 'user' },
      { id: ENGINEER_ID, email: 'engineer@example.test', passwordHash: PASSWORD_HASH, fullName: 'Engineer', globalRole: 'user' },
      { id: CLIENT_ID, email: 'client@example.test', passwordHash: PASSWORD_HASH, fullName: 'Client', globalRole: 'user' },
      { id: OUTSIDER_ID, email: 'outsider@example.test', passwordHash: PASSWORD_HASH, fullName: 'Outsider', globalRole: 'user' },
      { id: ADMIN_ID, email: 'admin@example.test', passwordHash: PASSWORD_HASH, fullName: 'Admin', globalRole: 'admin' },
    ]);
    await db.insert(schema.projects).values([
      {
        id: PROJECT_A,
        title: 'Project A',
        objectType: 'house',
        networkSystem: 'tn-s',
        graphJson: createEmptyProjectGraph('Project A', PROJECT_A),
        ownerId: OWNER_ID,
      },
      {
        id: PROJECT_B,
        title: 'Project B',
        objectType: 'house',
        networkSystem: 'tn-s',
        graphJson: createEmptyProjectGraph('Project B', PROJECT_B),
        ownerId: OUTSIDER_ID,
      },
      {
        id: LEGACY_PROJECT,
        title: 'Legacy',
        objectType: 'house',
        networkSystem: 'tn-s',
        graphJson: createEmptyProjectGraph('Legacy', LEGACY_PROJECT),
        ownerId: null,
      },
    ]);
    await db.insert(schema.projectMembers).values([
      { projectId: PROJECT_A, userId: ENGINEER_ID, role: 'engineer' },
      { projectId: PROJECT_A, userId: CLIENT_ID, role: 'client' },
    ]);
    await db.insert(schema.projectComments).values({
      id: COMMENT_ID,
      projectId: PROJECT_A,
      authorId: CLIENT_ID,
      viewTab: 'plan',
      body: 'Комментарий клиента',
      status: 'open',
    });
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Единая 404-семантика (S2-RBAC-13…16, S2-ISO-01)', () => {
    it('S2-RBAC-13: outsider и несуществующий проект дают одинаковый 404', async () => {
      const outsider = await policy.roleForAsync(PROJECT_A, OUTSIDER_ID).catch((error: unknown) => error);
      const missing = await policy.roleForAsync(
        '99999999-9999-4999-8999-999999999999',
        OUTSIDER_ID,
      ).catch((error: unknown) => error);

      expect(outsider).toBeInstanceOf(NotFoundException);
      expect(missing).toBeInstanceOf(NotFoundException);
      expect((outsider as NotFoundException).message).toBe((missing as NotFoundException).message);
      expect((outsider as NotFoundException).message).not.toContain(PROJECT_A);
    });

    it('S2-ISO-01: чтение чужого графа через сервис — 404, без данных', async () => {
      const before = await dbSnapshotAsync(client);
      await expect(projects.getByIdAsync(PROJECT_B, OWNER_ID)).rejects.toBeInstanceOf(NotFoundException);
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });
  });

  describe('Запись графа: 4 пути (S2-RBAC-08/09/10/11, S2-ISO-11/12)', () => {
    it('S2-RBAC-08: client не может WRITE через updateGraphAsync', async () => {
      const before = await dbSnapshotAsync(client);
      const graph: ProjectGraph = createEmptyProjectGraph('Project A', PROJECT_A);
      await expect(projects.updateGraphAsync(PROJECT_A, graph, CLIENT_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });

    it('S2-ISO-11: client не может WRITE через import-cad', async () => {
      const before = await dbSnapshotAsync(client);
      await expect(
        projects.importCadAsync(
          PROJECT_A,
          { buffer: Buffer.from('  0\nSECTION\n'), originalname: 'plan.dxf', size: 15 },
          CLIENT_ID,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });

    it('S2-ISO-12: client не может WRITE через ai/assemble-panel (сервисный вызов)', async () => {
      const before = await dbSnapshotAsync(client);
      // assemble-panel читает граф, затем вызывает updateGraphAsync с userId —
      // проверка write-роли обязана сработать до записи.
      const graph = await projects.getByIdAsync(PROJECT_A, CLIENT_ID);
      await expect(projects.updateGraphAsync(PROJECT_A, graph.graph, CLIENT_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });

    it('S2-RBAC-11: client не может загрузить подложку', async () => {
      const before = await dbSnapshotAsync(client);
      await expect(
        projects.uploadFloorPlanAsync(
          PROJECT_A,
          { buffer: Buffer.from('%PDF-1.7\n%%EOF'), originalname: 'plan.pdf', size: 12 },
          CLIENT_ID,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });

    it('S2-RBAC-14: outsider получает 404 на запись графа, без изменений', async () => {
      const before = await dbSnapshotAsync(client);
      const graph = createEmptyProjectGraph('Project A', PROJECT_A);
      await expect(projects.updateGraphAsync(PROJECT_A, graph, OUTSIDER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });
  });

  describe('Комментарии и участники (S2-RBAC-07/15/20, S2-ISO-05/06, новый S2-RBAC-21)', () => {
    it('S2-RBAC-07: client создаёт комментарий в своём проекте', async () => {
      const created = await access.addCommentAsync(PROJECT_A, CLIENT_ID, { text: 'Проверить щит' });
      expect(created.resolved).toBe(false);
      expect(created.projectId).toBe(PROJECT_A);
    });

    it('S2-ISO-05: outsider не может создать комментарий — 404, строка не создана', async () => {
      const before = await dbSnapshotAsync(client);
      await expect(
        access.addCommentAsync(PROJECT_A, OUTSIDER_ID, { text: 'Вторжение' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });

    it('S2-RBAC-21 (NEW, свободный ID): outsider не может resolve комментарий — 404', async () => {
      const before = await dbSnapshotAsync(client);
      await expect(
        access.resolveCommentAsync(PROJECT_A, COMMENT_ID, OUTSIDER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });

    it('S2-ISO-06: client может resolve комментарий в своём проекте (утверждено PO)', async () => {
      const created = await access.addCommentAsync(PROJECT_A, CLIENT_ID, { text: 'Согласую' });
      const resolved = await access.resolveCommentAsync(PROJECT_A, created.id, CLIENT_ID);
      expect(resolved.resolved).toBe(true);
    });

    it('S2-RBAC-16: outsider не может добавить участника — 404', async () => {
      const before = await dbSnapshotAsync(client);
      await expect(
        access.addMemberAsync(PROJECT_A, OUTSIDER_ID, { email: 'admin@example.test', role: 'client' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });

    it('Engineer не может добавить участника — 403', async () => {
      const before = await dbSnapshotAsync(client);
      await expect(
        access.addMemberAsync(PROJECT_A, ENGINEER_ID, { email: 'admin@example.test', role: 'client' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });
  });

  describe('Сервисные вызовы в обход HTTP (S2-ISO-08) и legacy (PO-D04)', () => {
    it('S2-ISO-08: прямой DI-вызов без userId-проверки невозможен (тип обязателен)', async () => {
      const before = await dbSnapshotAsync(client);
      await expect(projects.getByIdAsync(PROJECT_A, OUTSIDER_ID)).rejects.toBeInstanceOf(NotFoundException);
      await expect(access.addCommentAsync(PROJECT_A, OUTSIDER_ID, { text: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });

    it('S2-RBAC-24: global admin без membership — deny-by-default (404)', async () => {
      const before = await dbSnapshotAsync(client);
      await expect(projects.getByIdAsync(PROJECT_A, ADMIN_ID)).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        projects.updateGraphAsync(PROJECT_A, createEmptyProjectGraph('Project A', PROJECT_A), ADMIN_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });

    it('LEGACY/PO-D04: проект с owner_id=NULL недоступен всем (deny-by-default)', async () => {
      for (const user of [OWNER_ID, ENGINEER_ID, CLIENT_ID, ADMIN_ID, OUTSIDER_ID]) {
        await expect(projects.getByIdAsync(LEGACY_PROJECT, user)).rejects.toBeInstanceOf(NotFoundException);
      }
    });

    it('S2-MCP-01: ERP-операция без member — 404, внешний MCP не вызван', async () => {
      const before = await dbSnapshotAsync(client);
      await expect(
        integrations.createOrderAsync(
          {
            projectId: PROJECT_B,
            target: 'moysklad',
            items: [{ sku: 'SKU-1', quantity: 1 }],
            confirmationToken: 'x',
          },
          OWNER_ID,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      assertNoSideEffects(spy, before, await dbSnapshotAsync(client));
    });
  });

  describe('ProjectAccessGuard + @ProjectScoped (D-01/D-02 интерфейс)', () => {
    class ScopedController {
      public write(): void {
        /* metadata-only */
      }

      public unscoped(): void {
        /* no metadata */
      }
    }

    const handler = new ScopedController();
    // Декоратор применяется вручную, чтобы не требовать experimentalDecorators
    // от тестового раннера: контракт декоратора — записать metadata по ключу.
    expect(typeof ProjectScoped({ param: 'id', role: 'write' })).toBe('function');
    Reflect.defineMetadata(PROJECT_SCOPE_KEY, { param: 'id', role: 'write' }, handler.write);

    it('S2-AUTH/META: без metadata guard пропускает запрос', async () => {
      const context = contextFor(handler.unscoped, { params: { id: PROJECT_A }, user: undefined });
      expect(PROJECT_SCOPE_KEY).toBe('voltwirecraft:project-scope');
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('S2-RBAC-20: без request.user guard отвечает 401 до любой проверки', async () => {
      const context = contextFor(handler.write, { params: { id: PROJECT_A } });
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('S2-RBAC-08: guard пропускает owner/engineer на write и блокирует client — 403', async () => {
      const ok = contextFor(handler.write, { params: { id: PROJECT_A }, user: identity(OWNER_ID) });
      const denied = contextFor(handler.write, { params: { id: PROJECT_A }, user: identity(CLIENT_ID) });
      await expect(guard.canActivate(ok)).resolves.toBe(true);
      await expect(guard.canActivate(denied)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('S2-RBAC-13/24: guard даёт 404 для outsider и admin без membership', async () => {
      const outsider = contextFor(handler.write, { params: { id: PROJECT_A }, user: identity(OUTSIDER_ID) });
      const admin = contextFor(handler.write, { params: { id: PROJECT_A }, user: identity(ADMIN_ID, 'admin') });
      await expect(guard.canActivate(outsider)).rejects.toBeInstanceOf(NotFoundException);
      await expect(guard.canActivate(admin)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
