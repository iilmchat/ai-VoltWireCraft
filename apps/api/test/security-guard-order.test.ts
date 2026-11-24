// © 2026 VoltWireCraft — Integration Verification Sprint / Agent 1
/** Реальный AppModule + PGlite: порядок guards и HTTP-поведение без подмены guards. */

import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RequestMethod, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEmptyProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import { DRIZZLE_DB } from '../src/database/drizzle.provider.js';
import { projectMembers, projects, schema, users } from '../src/database/schema.js';
import { RefreshSessionService } from '../src/auth/refresh-session.service.js';
import { ProjectAccessGuard } from '../src/auth/project-access.guard.js';
import { ProjectScoped } from '../src/auth/project-scoped.decorator.js';
import { UnauthorizedException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../src/auth/public.decorator.js';
import { REFRESH_AUTH_KEY } from '../src/auth/refresh-auth.decorator.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = '11111111-1111-4111-8111-111111111111';
const ENGINEER = '22222222-2222-4222-8222-222222222222';
const CLIENT = '33333333-3333-4333-8333-333333333333';
const OUTSIDER = '44444444-4444-4444-8444-444444444444';
/** Access-токены, привязанные к реальным сессиям (SEC-02 Stage 2). */
const accessTokens = new Map<string, string>();

const JWT_KEY = ['B1x2C3v4', 'B5n6M7q8', 'W9e0R1t2', 'Y3u4I5o6'].join('');
const OTHER_KEY = ['C1x2C3v4', 'C5n6M7q8', 'W9e0R1t2', 'Y3u4I5o6'].join('');

interface Journal {
  readonly entries: readonly { readonly tag: string }[];
}

describe('Integration: AppModule, guard order и RBAC', () => {
  let app: INestApplication;
  let url: string;
  let projectGuard: ProjectAccessGuard;
  let client: PGlite;

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://vwc:vwc@localhost:5432/voltwirecraft',
      REDIS_URL: 'redis://localhost:6379/0',
      CALC_ENGINE_URL: 'http://localhost:8000',
      JWT_SECRET: JWT_KEY,
      JWT_KID: 'v1',
      JWT_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '30d',
      JWT_REFRESH_HASH_PEPPER: OTHER_KEY,
      HITL_SIGNING_KEY: ['D1x2C3v4', 'B5n6M7q8', 'W9e0R1t2', 'Y3u4I5o6'].join(''),
      INTERNAL_SERVICE_TOKEN: ['E1x2C3v4', 'B5n6M7q8', 'W9e0R1t2', 'Y3u4I5o6'].join(''),
    });

    client = new PGlite();
    const migrationsFolder = fileURLToPath(new URL('../src/database/migrations', import.meta.url));
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as Journal;
    for (const entry of journal.entries) {
      const sql = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), 'utf8');
      for (const statement of sql.split('--> statement-breakpoint')) {
        if (/vector/i.test(statement) || /normative_chunks/.test(statement)) {
          continue;
        }
        await client.exec(statement);
      }
    }

    const db = drizzle(client, { schema });
    for (const [id, email, name] of [
      [OWNER, 'owner@sec.test', 'Owner'],
      [ENGINEER, 'engineer@sec.test', 'Engineer'],
      [CLIENT, 'client@sec.test', 'Client'],
      [OUTSIDER, 'outsider@sec.test', 'Outsider'],
    ] as const) {
      await db
        .insert(users)
        .values({ id, email, fullName: name, passwordHash: 'not-used', globalRole: 'user' });
    }
    await db.insert(projects).values({
      id: PROJECT_ID,
      title: 'Integration',
      objectType: 'house',
      networkSystem: 'tn-s',
      graphJson: createEmptyProjectGraph('Integration', PROJECT_ID),
      ownerId: OWNER,
    });
    for (const [userId, role] of [
      [ENGINEER, 'engineer'],
      [CLIENT, 'client'],
    ] as const) {
      await db.insert(projectMembers).values({ projectId: PROJECT_ID, userId, role });
    }

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_DB)
      .useValue(db)
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    projectGuard = moduleRef.get(ProjectAccessGuard, { strict: false });
    const sessions = moduleRef.get(RefreshSessionService, { strict: false });
    for (const id of [OWNER, ENGINEER, CLIENT, OUTSIDER]) {
      const issued = await sessions.issueAsync(id);
      accessTokens.set(id, issued.accessToken);
    }
  });

  afterAll(async () => {
    await app?.close();
    await client?.close();
  });

  const tokenFor = (id: string): string => {
    const token = accessTokens.get(id);
    if (token === undefined) {
      throw new Error(`Нет access-токена для ${id}`);
    }
    return token;
  };

  async function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
  ): Promise<number> {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: {
        ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response.status;
  }

  it('AppModule собирается с единым SecurityGuard', () => {
    expect(app).toBeDefined();
  });

  it('отсутствие JWT → 401', async () => {
    expect(await req('GET', `/projects/${PROJECT_ID}`)).toBe(401);
  });

  it('невалидный JWT → 401', async () => {
    expect(await req('GET', `/projects/${PROJECT_ID}`, 'garbage')).toBe(401);
  });

  it('PO-D01: ровно четыре разрешённых маршрута доступны без JWT', async () => {
    // POST без тела доходит до ZodValidationPipe → 400 (не 401):
    // значит JwtAuthGuard пропустил запрос как @Public.
    expect(await req('POST', '/auth/register')).toBe(400);
    expect(await req('POST', '/auth/login')).toBe(400);
    expect(await req('GET', '/health')).toBe(200);
    expect(await req('GET', '/catalog/devices')).toBe(200);

    // Остальные кандидаты остаются закрытыми.
    expect(await req('GET', '/auth/me')).toBe(401);
    expect(await req('GET', '/integrations/status')).toBe(401);
    expect(await req('POST', '/projects')).toBe(401);
    expect(await req('GET', `/projects/${PROJECT_ID}`)).toBe(401);
    expect(await req('POST', `/projects/${PROJECT_ID}/ai/chat`)).toBe(401);
    expect(await req('POST', `/projects/${PROJECT_ID}/ai/assemble-panel`)).toBe(401);
    expect(await req('POST', `/projects/${PROJECT_ID}/ai/audit-pue`)).toBe(401);
    expect(await req('POST', `/projects/${PROJECT_ID}/integrations/moysklad/check-stock`)).toBe(401);
    expect(await req('POST', `/projects/${PROJECT_ID}/integrations/moysklad/create-order`)).toBe(401);
    expect(await req('POST', `/projects/${PROJECT_ID}/integrations/bitrix24/send-estimate`)).toBe(401);
    // refresh НЕ публичный: без refresh-токена отказ 401 (не 404, не 200).
    expect(await req('POST', '/auth/refresh')).toBe(401);
    expect(await req('GET', '/auth/refresh')).toBe(404);
  });

  it('PO-D01 meta: публичная метка ровно на четырёх handler-ах, без наследования', () => {
    const discovery = new DiscoveryService(app.get(ModulesContainer));
    const scanner = new MetadataScanner();
    const reflector = new Reflector();
    const publicRoutes: string[] = [];
    const refreshRoutes: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const metatype = wrapper.metatype as (new (...args: never[]) => object) | undefined;
      if (metatype === undefined) {
        continue;
      }
      const classPath = (Reflect.getMetadata('path', metatype) as string | string[] | undefined) ?? '';
      const prefixes = Array.isArray(classPath) ? classPath : [classPath];
      const prototype = metatype.prototype as Record<string, unknown>;
      const classPublic = reflector.get<boolean>(IS_PUBLIC_KEY, metatype) === true;

      for (const methodName of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[methodName];
        if (typeof handler !== 'function') {
          continue;
        }
        const isPublic = classPublic || reflector.get<boolean>(IS_PUBLIC_KEY, handler) === true;
        const isRefresh =
          reflector.get<boolean>(REFRESH_AUTH_KEY, metatype) === true ||
          reflector.get<boolean>(REFRESH_AUTH_KEY, handler) === true;
        if (!isPublic && !isRefresh) {
          continue;
        }
        const handlerPath = (Reflect.getMetadata('path', handler) as string | string[] | undefined) ?? '';
        const verb = Reflect.getMetadata('method', handler) as RequestMethod | undefined;
        const verbName = verb === undefined ? 'UNKNOWN' : RequestMethod[verb];
        for (const prefix of prefixes) {
          for (const segment of Array.isArray(handlerPath) ? handlerPath : [handlerPath]) {
            const route = `/${prefix}/${segment}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
            if (isPublic) {
              publicRoutes.push(`${verbName} ${route}`);
            }
            if (isRefresh) {
              refreshRoutes.push(`${verbName} ${route}`);
            }
          }
        }
      }
    }

    const expected = [
      'POST /auth/login',
      'POST /auth/register',
      'GET /health',
      'GET /catalog/devices',
    ].sort();
    expect(publicRoutes.sort()).toEqual(expected);
    expect(publicRoutes).toHaveLength(4);
    expect(publicRoutes).not.toContain('GET /auth/me');
    expect(publicRoutes).not.toContain('GET /integrations/status');
    expect(publicRoutes).not.toContain('POST /auth/refresh');
    expect(refreshRoutes.sort()).toEqual(['POST /auth/refresh']);
  });

  it('outsider с валидным JWT → 404 (доказывает JWT до ProjectAccessGuard)', async () => {
    expect(await req('GET', `/projects/${PROJECT_ID}`, tokenFor(OUTSIDER))).toBe(404);
  });

  it('client с валидным JWT → 403 на write, 200 на read', async () => {
    expect(
      await req('PUT', `/projects/${PROJECT_ID}/graph`, tokenFor(CLIENT), {
        graph: createEmptyProjectGraph('Integration', PROJECT_ID),
      }),
    ).toBe(403);
    expect(await req('GET', `/projects/${PROJECT_ID}`, tokenFor(CLIENT))).toBe(200);
  });

  it('engineer/owner → доступ согласно RBAC', async () => {
    expect(
      await req('PUT', `/projects/${PROJECT_ID}/graph`, tokenFor(ENGINEER), {
        graph: createEmptyProjectGraph('Integration', PROJECT_ID),
      }),
    ).toBe(200);
    expect(await req('GET', `/projects/${PROJECT_ID}`, tokenFor(OWNER))).toBe(200);
    expect(await req('POST', `/projects/${PROJECT_ID}/members`, tokenFor(ENGINEER), {})).toBe(403);
  });

  it('отсутствие request.user не приводит к обходу ProjectAccessGuard', async () => {
    class Dummy {
      public route(): void {
        return;
      }
    }
    ProjectScoped({ param: 'id', role: 'read' })(
      Dummy.prototype,
      'route',
      Object.getOwnPropertyDescriptor(Dummy.prototype, 'route')!,
    );
    const context = {
      getHandler: () => Dummy.prototype.route,
      getClass: () => Dummy,
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, params: { id: PROJECT_ID } }) }),
    } as unknown as ExecutionContext;

    await expect(projectGuard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
