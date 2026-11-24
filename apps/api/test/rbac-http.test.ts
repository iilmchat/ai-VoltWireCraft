// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * HTTP-level проверка цепочки: подменённый JwtAuthGuard внутри единого
 * SecurityGuard → ProjectAccessGuard → контроллер. Порядок фиксируется
 * композитным guard'ом, а не регистрацией в разных модулях.
 * Не дублирует реализацию JWT: проверяется только корректность project
 * authorization, metadata и все 4 write-path через реальные HTTP-маршруты.
 */

import 'reflect-metadata';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEmptyProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import type { AuthUser } from '../src/auth/auth.service.js';
import { JwtAuthGuard } from '../src/auth/auth.guard.js';
import { SecurityGuard } from '../src/auth/security.guard.js';
import { RefreshGuard } from '../src/auth/refresh.guard.js';
import { PanelArchitectAgent } from '../src/agents/panel-architect.agent.js';
import { PueAuditorAgent } from '../src/agents/pue-auditor.agent.js';
import { CopilotChatAgent } from '../src/agents/copilot-chat.agent.js';
import { DRIZZLE_DB } from '../src/database/drizzle.provider.js';
import { ProjectPolicyService } from '../src/policy/project-policy.service.js';
import { PolicyModule } from '../src/policy/policy.module.js';
import { ProjectsController } from '../src/projects/projects.controller.js';
import { ProjectsService } from '../src/projects/projects.service.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const ENGINEER_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const OUTSIDER_ID = '44444444-4444-4444-8444-444444444444';

const USERS: Record<string, AuthUser> = {
  owner: { id: OWNER_ID, email: 'owner@test', displayName: 'Owner', role: 'user' },
  engineer: { id: ENGINEER_ID, email: 'engineer@test', displayName: 'Engineer', role: 'user' },
  client: { id: CLIENT_ID, email: 'client@test', displayName: 'Client', role: 'user' },
  outsider: { id: OUTSIDER_ID, email: 'outsider@test', displayName: 'Outsider', role: 'user' },
};

/** Роли в проекте: Used by the fake policy through ProjectAccessGuard. */
const ROLES: Record<string, string> = {
  [OWNER_ID]: 'owner',
  [ENGINEER_ID]: 'engineer',
  [CLIENT_ID]: 'client',
};

/** Замена JwtAuthGuard: только заполняет request.user, не реализует JWT. */
class FakeAuthGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();
    const name = request.headers['x-test-user'];
    if (name === undefined || USERS[name] === undefined) {
      throw new UnauthorizedException('Требуется тестовый пользователь');
    }
    request.user = USERS[name];
    return true;
  }
}

describe('HTTP guard chain: ProjectAccessGuard + @ProjectScoped', () => {
  let app: INestApplication;
  let url: string;
  let writeSpy: ReturnType<typeof vi.fn>;
  let importSpy: ReturnType<typeof vi.fn>;
  let assembleSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    writeSpy = vi.fn(async () => ({ ...createEmptyProjectGraph('Project', PROJECT_ID), id: PROJECT_ID }));
    importSpy = vi.fn(async () => ({ ...createEmptyProjectGraph('Project', PROJECT_ID), id: PROJECT_ID }));
    assembleSpy = vi.fn(async () => ({ graph: createEmptyProjectGraph('Project', PROJECT_ID) }));
    const service = {
      getByIdAsync: vi.fn(async () => createEmptyProjectGraph('Project', PROJECT_ID)),
      updateGraphAsync: writeSpy,
      calculateAsync: vi.fn(async () => ({ totalLengthM: 0, edges: [] })),
      uploadFloorPlanAsync: vi.fn(),
      calculateShortCircuitAsync: vi.fn(),
      checkSelectivityTccAsync: vi.fn(),
      importCadAsync: importSpy,
      createAsync: vi.fn(),
    };

    const module = await Test.createTestingModule({
      imports: [PolicyModule],
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: service },
        { provide: JwtAuthGuard, useClass: FakeAuthGuard },
        { provide: RefreshGuard, useValue: { canActivate: async () => true } },
        { provide: APP_GUARD, useClass: SecurityGuard },
        { provide: PanelArchitectAgent, useValue: { assembleAsync: assembleSpy } },
        { provide: PueAuditorAgent, useValue: {} },
        { provide: CopilotChatAgent, useValue: {} },
      ],
    })
      // Реальный ProjectAccessGuard работает с реальной политикой; подменяем
      // только источник данных (БД) детерминированной таблицей ролей.
      .overrideProvider(DRIZZLE_DB)
      .useValue({})
      .overrideProvider(ProjectPolicyService)
      .useValue({
        roleForAsync: async (projectId: string, userId: string) => {
          const role = ROLES[userId];
          if (role === undefined) {
            throw new NotFoundException('Проект не найден');
          }
          return role;
        },
        requireAsync: async (projectId: string, userId: string, permission: string) => {
          const role = ROLES[userId];
          if (role === undefined) {
            throw new NotFoundException('Проект не найден');
          }
          if (permission === 'owner' && role !== 'owner') {
            throw new ForbiddenException('Недостаточно прав');
          }
          if (permission === 'write' && role === 'client') {
            throw new ForbiddenException('Недостаточно прав');
          }
          return role;
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('S2-RBAC-01: GET без аутентификации → 401', async () => {
    const response = await fetch(`${url}/projects/${PROJECT_ID}`);
    expect(response.status).toBe(401);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('S2-RBAC-13: GET аутсайдера → 404 без данных графа', async () => {
    const response = await fetch(`${url}/projects/${PROJECT_ID}`, {
      headers: { 'x-test-user': 'outsider' },
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { data?: { details?: { message?: string } } };
    expect(JSON.stringify(body)).not.toContain('graph');
    expect(JSON.stringify(body)).not.toContain(PROJECT_ID);
  });

  it('S2-RBAC-06: GET клиента → 200 (просмотр разрешён)', async () => {
    const response = await fetch(`${url}/projects/${PROJECT_ID}`, {
      headers: { 'x-test-user': 'client' },
    });
    expect(response.status).toBe(200);
  });

  it('S2-RBAC-08: PUT /graph клиентом → 403, сервис не вызван', async () => {
    writeSpy.mockClear();
    const response = await fetch(`${url}/projects/${PROJECT_ID}/graph`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-user': 'client' },
      body: JSON.stringify({ graph: createEmptyProjectGraph('Project', PROJECT_ID) }),
    });
    expect(response.status).toBe(403);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('S2-RBAC-03: PUT /graph инженером → 200 и ровно одна запись', async () => {
    writeSpy.mockClear();
    const response = await fetch(`${url}/projects/${PROJECT_ID}/graph`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-user': 'engineer' },
      body: JSON.stringify({ graph: createEmptyProjectGraph('Project', PROJECT_ID) }),
    });
    expect(response.status).toBe(200);
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('WRITE-PATH-2: import-cad без аутентификации → 401, сервис не вызван', async () => {
    importSpy.mockClear();
    const response = await fetch(`${url}/projects/${PROJECT_ID}/import-cad`, { method: 'POST' });
    expect(response.status).toBe(401);
    expect(importSpy).not.toHaveBeenCalled();
  });

  it('WRITE-PATH-2: import-cad клиентом → 403, сервис не вызван', async () => {
    importSpy.mockClear();
    const response = await fetch(`${url}/projects/${PROJECT_ID}/import-cad`, {
      method: 'POST',
      headers: { 'x-test-user': 'client' },
    });
    expect(response.status).toBe(403);
    expect(importSpy).not.toHaveBeenCalled();
  });

  it('WRITE-PATH-2: import-cad аутсайдером → 404, сервис не вызван', async () => {
    importSpy.mockClear();
    const response = await fetch(`${url}/projects/${PROJECT_ID}/import-cad`, {
      method: 'POST',
      headers: { 'x-test-user': 'outsider' },
    });
    expect(response.status).toBe(404);
    expect(importSpy).not.toHaveBeenCalled();
  });

  it('WRITE-PATH-3: ai/assemble-panel без аутентификации → 401, LLM не вызван', async () => {
    assembleSpy.mockClear();
    const response = await fetch(`${url}/projects/${PROJECT_ID}/ai/assemble-panel`, { method: 'POST' });
    expect(response.status).toBe(401);
    expect(assembleSpy).not.toHaveBeenCalled();
  });

  it('WRITE-PATH-3: ai/assemble-panel клиентом → 403, LLM не вызван', async () => {
    assembleSpy.mockClear();
    const response = await fetch(`${url}/projects/${PROJECT_ID}/ai/assemble-panel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': 'client' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(403);
    expect(assembleSpy).not.toHaveBeenCalled();
  });

  it('WRITE-PATH-3: ai/assemble-panel аутсайдером → 404, LLM не вызван', async () => {
    assembleSpy.mockClear();
    const response = await fetch(`${url}/projects/${PROJECT_ID}/ai/assemble-panel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': 'outsider' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(404);
    expect(assembleSpy).not.toHaveBeenCalled();
  });
});
