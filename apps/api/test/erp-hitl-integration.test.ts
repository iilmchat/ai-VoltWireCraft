// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * P0 remediation: AUDIT-01 (HITL) и AUDIT-02 (ERP write authorization).
 * Каждый отказ проверяет MCP calls = 0 и неизменность снимка БД.
 */

import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BadGatewayException,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEmptyProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import type { AuthUser } from '../src/auth/auth.service.js';
import { JwtAuthGuard } from '../src/auth/auth.guard.js';
import { ProjectAccessGuard } from '../src/auth/project-access.guard.js';
import { SecurityGuard } from '../src/auth/security.guard.js';
import { CalcEngineClient } from '../src/calc-engine/calc-engine.client.js';
import { DRIZZLE_DB, type Database } from '../src/database/drizzle.provider.js';
import { schema } from '../src/database/schema.js';
import { ErpMcpService } from '../src/integrations/erp-mcp.service.js';
import { IntegrationService } from '../src/integrations/integration.service.js';
import { IntegrationsController } from '../src/integrations/integrations.controller.js';
import { ProjectPolicyService } from '../src/policy/project-policy.service.js';
import { ProjectsService } from '../src/projects/projects.service.js';
import { HitlService } from '../src/security/hitl.service.js';
import { HITL_REPLAY_STORE } from '../src/security/security.module.js';
import { InMemoryReplayStore } from '../src/security/replay-store.js';

const KEY = ['A1b2C3d4', 'E5f6G7h8', 'I9j0K1l2', 'M3n4O5p6'].join('');
const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_PROJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROOM_ID = '11111111-1111-4111-8111-111111111111';
const OWNER = '11111111-1111-4111-8111-111111111111';
const ENGINEER = '22222222-2222-4222-8222-222222222222';
const CLIENT = '33333333-3333-4333-8333-333333333333';
const OUTSIDER = '44444444-4444-4444-8444-444444444444';
const ITEMS = [{ sku: 'IEK-VA47-29-C16', quantity: 1 }];

const USERS: Record<string, AuthUser> = {
  owner: { id: OWNER, email: 'o@test', displayName: 'Owner', role: 'user' },
  engineer: { id: ENGINEER, email: 'e@test', displayName: 'Engineer', role: 'user' },
  client: { id: CLIENT, email: 'c@test', displayName: 'Client', role: 'user' },
  outsider: { id: OUTSIDER, email: 'x@test', displayName: 'Outsider', role: 'user' },
};

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

interface Journal {
  readonly entries: readonly { readonly tag: string }[];
}

async function applyMigrationsAsync(client: PGlite): Promise<void> {
  const migrationsFolder = fileURLToPath(new URL('../src/database/migrations', import.meta.url));
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

/** Канонический хэш совпадает с IntegrationService.buildErpItemsHash. */
function erpHash(projectId: string, action: string, items: readonly { sku: string; quantity: number }[], dealId?: string): string {
  const canonical = {
    projectId,
    action,
    items: [...items]
      .map((item) => ({ sku: item.sku, quantity: item.quantity }))
      .sort((a, b) => a.sku.localeCompare(b.sku) || a.quantity - b.quantity),
    dealId: dealId ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

describe('P0 remediation — ERP write fail-closed + HITL integration', () => {
  let client: PGlite;
  let app: INestApplication;
  let url: string;
  let service: IntegrationService;
  let hitl: HitlService;
  let mcpCall: ReturnType<typeof vi.fn>;
  let calcCall: ReturnType<typeof vi.fn>;

  async function snapshotAsync(): Promise<string> {
    const tables = ['users', 'projects', 'project_members', 'project_comments', 'floor_plans'];
    const result: Record<string, unknown> = {};
    for (const table of tables) {
      result[table] = (await client.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
    }
    return JSON.stringify(result);
  }

  function token(sub: string, action: 'create_order' | 'send_estimate', overrides: {
    projectId?: string;
    dealId?: string;
    confirmedBy?: string;
    ttlSeconds?: number;
    items?: readonly { sku: string; quantity: number }[];
  } = {}): string {
    const projectId = overrides.projectId ?? PROJECT_ID;
    const items = overrides.items ?? ITEMS;
    return hitl.issue({
      sub,
      confirmedBy: overrides.confirmedBy ?? sub,
      projectId,
      action,
      itemsHash: erpHash(projectId, action, items, overrides.dealId),
      ...(overrides.dealId !== undefined ? { dealId: overrides.dealId } : {}),
      ttlSeconds: overrides.ttlSeconds ?? 60,
    });
  }

  beforeAll(async () => {
    client = new PGlite();
    await applyMigrationsAsync(client);
    const db = drizzle(client, { schema });

    mcpCall = vi.fn(async (server: string, tool: string) => ({
      data: tool === 'moysklad_check_stock'
        ? { items: [{ sku: 'IEK-VA47-29-C16', quantity: 1, available: 12, sufficient: true }], allAvailable: true }
        : { success: true, target: tool.includes('moysklad') ? 'moysklad' : 'bitrix24', externalId: 'E-1', operationId: 'op-1', message: 'ok' },
      operationId: 'op-1',
    }));
    calcCall = vi.fn(async () => ({ actualLux: 159 }));

    const module = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [
        IntegrationService,
        ProjectPolicyService,
        HitlService,
        { provide: HITL_REPLAY_STORE, useClass: InMemoryReplayStore },
        { provide: ConfigService, useValue: { get: (key: string) => (key === 'HITL_SIGNING_KEY' ? KEY : undefined) } },
        { provide: Reflector, useClass: Reflector },
        { provide: DRIZZLE_DB, useValue: db as unknown as Database },
        { provide: ErpMcpService, useValue: { callToolAsync: mcpCall, statusAsync: vi.fn(async () => []) } },
        {
          provide: ProjectsService,
          useValue: {
            getByIdAsync: vi.fn(async () => ({
              id: PROJECT_ID,
              graph: {
                ...createEmptyProjectGraph('Project', PROJECT_ID),
                rooms: [{ id: ROOM_ID, type: 'living', polygon: [{ x: 0, y: 0 }] }],
                floorPlan: { ceilingHeightM: 2.7 },
              },
            })),
          },
        },
        { provide: CalcEngineClient, useValue: { calculateLightingAsync: calcCall } },
        { provide: JwtAuthGuard, useClass: FakeAuthGuard },
        { provide: ProjectAccessGuard, useClass: ProjectAccessGuard },
        { provide: APP_GUARD, useClass: SecurityGuard },
      ],
    }).compile();

    service = module.get(IntegrationService);
    hitl = module.get(HitlService);

    const hash = '00'.repeat(16) + ':' + '11'.repeat(64);
    await db.insert(schema.users).values([
      { id: OWNER, email: 'o@test.io', passwordHash: hash, fullName: 'Owner' },
      { id: ENGINEER, email: 'e@test.io', passwordHash: hash, fullName: 'Engineer' },
      { id: CLIENT, email: 'c@test.io', passwordHash: hash, fullName: 'Client' },
      { id: OUTSIDER, email: 'x@test.io', passwordHash: hash, fullName: 'Outsider' },
    ]);
    await db.insert(schema.projects).values({
      id: PROJECT_ID,
      title: 'Project',
      objectType: 'house',
      networkSystem: 'tn-s',
      graphJson: createEmptyProjectGraph('Project', PROJECT_ID),
      ownerId: OWNER,
    });
    await db.insert(schema.projectMembers).values([
      { projectId: PROJECT_ID, userId: ENGINEER, role: 'engineer' },
      { projectId: PROJECT_ID, userId: CLIENT, role: 'client' },
    ]);

    app = module.createNestApplication();
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
    await client.close();
  });

  const orderRequest = (confirmationToken: string) => ({
    projectId: PROJECT_ID,
    target: 'moysklad' as const,
    items: ITEMS,
    confirmationToken,
  });
  const estimateRequest = (confirmationToken: string, dealId = '77') => ({
    projectId: PROJECT_ID,
    target: 'bitrix24' as const,
    items: ITEMS,
    dealId,
    confirmationToken,
  });

  async function assertDeniedAsync(promise: Promise<unknown>, status?: number): Promise<void> {
    const before = await snapshotAsync();
    mcpCall.mockClear();
    try {
      await promise;
      throw new Error('Операция должна быть отклонена');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(status === 403 || status === 404 ? ForbiddenException : UnauthorizedException);
    }
    expect(mcpCall).not.toHaveBeenCalled();
    expect(await snapshotAsync()).toBe(before);
  }

  describe('service-level (прямой DI-вызов)', () => {
    it('Client → create-order: 403, MCP=0', async () => {
      await assertDeniedAsync(service.createOrderAsync(orderRequest('x'), CLIENT), 403);
    });

    it('Client → send-estimate: 403, MCP=0', async () => {
      await assertDeniedAsync(service.sendEstimateAsync(estimateRequest('x'), CLIENT), 403);
    });

    it('Owner + произвольный HITL → 401, MCP=0', async () => {
      await assertDeniedAsync(service.createOrderAsync(orderRequest('x'), OWNER));
    });

    it('Engineer + произвольный HITL → 401, MCP=0', async () => {
      await assertDeniedAsync(service.sendEstimateAsync(estimateRequest('x'), ENGINEER));
    });

    it('Issuer token с чужим sub → 401, MCP=0', async () => {
      await assertDeniedAsync(service.createOrderAsync(orderRequest(token(ENGINEER, 'create_order')), OWNER));
    });

    it('Чужой projectId → 401, MCP=0', async () => {
      await assertDeniedAsync(
        service.createOrderAsync(orderRequest(token(OWNER, 'create_order', { projectId: OTHER_PROJECT })), OWNER),
      );
    });

    it('Просроченный токен → 401, MCP=0', async () => {
      vi.useFakeTimers();
      try {
        const expired = token(OWNER, 'create_order', { ttlSeconds: 60 });
        vi.setSystemTime(Date.now() + 91_000);
        await assertDeniedAsync(service.createOrderAsync(orderRequest(expired), OWNER));
      } finally {
        vi.useRealTimers();
      }
    });

    it('Неверный itemsHash → 401, MCP=0', async () => {
      const wrong = hitl.issue({
        sub: OWNER,
        confirmedBy: OWNER,
        projectId: PROJECT_ID,
        action: 'create_order',
        itemsHash: 'wrong',
        ttlSeconds: 60,
      });
      await assertDeniedAsync(service.createOrderAsync(orderRequest(wrong), OWNER));
    });

    it('Неверный dealId → 401, MCP=0', async () => {
      await assertDeniedAsync(
        service.sendEstimateAsync(
          estimateRequest(token(OWNER, 'send_estimate', { dealId: '99' }), '77'),
          OWNER,
        ),
      );
    });

    it('Повторный токен → 401, MCP=0', async () => {
      const reused = token(OWNER, 'create_order');
      await assertDeniedAsync(service.createOrderAsync(orderRequest(reused), OWNER), 403);
      await assertDeniedAsync(service.createOrderAsync(orderRequest(reused), OWNER));
    });

    it('PO-D14a: API не назначает approver даже при валидном токене → 403, MCP=0', async () => {
      await assertDeniedAsync(service.createOrderAsync(orderRequest(token(OWNER, 'create_order')), OWNER), 403);
    });

    it('Read-only check-stock работает', async () => {
      mcpCall.mockClear();
      const result = await service.checkStockAsync(ITEMS);
      expect(result.allAvailable).toBe(true);
      expect(mcpCall).toHaveBeenCalledTimes(1);
    });
  });

  describe('HTTP', () => {
    const post = (path: string, body: unknown, user?: string) =>
      fetch(`${url}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(user !== undefined ? { 'x-test-user': user } : {}),
        },
        body: JSON.stringify(body),
      });

    it('Client → create-order: 403, MCP=0', async () => {
      mcpCall.mockClear();
      const before = await snapshotAsync();
      const response = await post('/projects/' + PROJECT_ID + '/integrations/moysklad/create-order', orderRequest('x'), 'client');
      expect(response.status).toBe(403);
      expect(mcpCall).not.toHaveBeenCalled();
      expect(await snapshotAsync()).toBe(before);
    });

    it('Client → send-estimate: 403, MCP=0', async () => {
      mcpCall.mockClear();
      const response = await post('/projects/' + PROJECT_ID + '/integrations/bitrix24/send-estimate', estimateRequest('x'), 'client');
      expect(response.status).toBe(403);
      expect(mcpCall).not.toHaveBeenCalled();
    });

    it('Owner + произвольный HITL → 401, MCP=0', async () => {
      mcpCall.mockClear();
      const response = await post('/projects/' + PROJECT_ID + '/integrations/moysklad/create-order', orderRequest('x'), 'owner');
      expect(response.status).toBe(401);
      expect(mcpCall).not.toHaveBeenCalled();
    });

    it('Outsider → 404, MCP=0', async () => {
      mcpCall.mockClear();
      const response = await post('/projects/' + PROJECT_ID + '/integrations/moysklad/create-order', orderRequest('x'), 'outsider');
      expect(response.status).toBe(404);
      expect(mcpCall).not.toHaveBeenCalled();
    });

    it('Read-only check-stock для Client → 200, MCP=1', async () => {
      mcpCall.mockClear();
      const response = await post('/projects/' + PROJECT_ID + '/integrations/moysklad/check-stock', { items: ITEMS }, 'client');
      expect(response.status).toBe(201);
      expect(mcpCall).toHaveBeenCalledTimes(1);
      expect(mcpCall).toHaveBeenCalledWith('moysklad', 'moysklad_check_stock', expect.objectContaining({ skus: expect.any(Array) }), expect.anything());
    });

    it('Lighting calculation для Client → 200, calc=1', async () => {
      calcCall.mockClear();
      const response = await post('/projects/' + PROJECT_ID + '/lighting/calculate', {
        roomId: ROOM_ID,
        luminaireFluxLm: 1200,
        luminairePowerW: 14,
      }, 'client');
      expect(response.status).toBe(201);
      expect(calcCall).toHaveBeenCalledTimes(1);
    });
  });
});

describe('API↔MCP contract (ErpMcpService)', () => {
  const config = {
    get: (key: string): unknown => {
      if (key === 'MOYSKLAD_MCP_URL') return 'http://moysklad-mcp:5003';
      if (key === 'BITRIX24_MCP_URL') return 'http://bitrix24-mcp:5003';
      if (key === 'MCP_HTTP_TIMEOUT_MS') return 5000;
      return undefined;
    },
  } as unknown as ConfigService;

  it('использует /mcp/tools, плоский payload и валидирует ToolEnvelope', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      tool: 'moysklad_check_stock',
      data: { ok: true },
      message: 'ok',
    }), { status: 200 }));

    try {
      const gateway = new ErpMcpService(config);
      const result = await gateway.callToolAsync(
        'moysklad',
        'moysklad_check_stock',
        { skus: ['IEK-VA47-29-C16'] },
        z.object({ ok: z.boolean() }),
      );

      expect(result.data.ok).toBe(true);
      expect(result.operationId).toMatch(/^op-/);
      const [request, init] = fetchSpy.mock.calls[0] as [RequestInfo | URL, RequestInit];
      expect(new URL(String(request)).pathname).toBe('/mcp/tools/moysklad_check_stock');
      expect(JSON.parse(String(init.body))).toEqual({ skus: ['IEK-VA47-29-C16'] });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('success:false из MCP не считается успешной записью', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: false,
      tool: 'moysklad_create_customer_order',
      data: {},
      message: 'rejected',
    }), { status: 200 }));

    try {
      const gateway = new ErpMcpService(config);
      await expect(gateway.callToolAsync(
        'moysklad',
        'moysklad_create_customer_order',
        { projectTitle: 'P', items: ITEMS },
        z.object({ ok: z.boolean() }),
        'token',
      )).rejects.toBeInstanceOf(BadGatewayException);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
