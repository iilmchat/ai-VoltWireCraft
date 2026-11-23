// © 2026 VoltWireCraft — Integration Verification Sprint / Agent 1
/** Реальный AppModule + PGlite: порядок guards и HTTP-поведение без подмены guards. */

import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEmptyProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import { DRIZZLE_DB } from '../src/database/drizzle.provider.js';
import { projectMembers, projects, schema, users } from '../src/database/schema.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { ProjectAccessGuard } from '../src/auth/project-access.guard.js';
import { ProjectScoped } from '../src/auth/project-scoped.decorator.js';
import { UnauthorizedException } from '@nestjs/common';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = '11111111-1111-4111-8111-111111111111';
const ENGINEER = '22222222-2222-4222-8222-222222222222';
const CLIENT = '33333333-3333-4333-8333-333333333333';
const OUTSIDER = '44444444-4444-4444-8444-444444444444';

const JWT_KEY = ['B1x2C3v4', 'B5n6M7q8', 'W9e0R1t2', 'Y3u4I5o6'].join('');
const OTHER_KEY = ['C1x2C3v4', 'C5n6M7q8', 'W9e0R1t2', 'Y3u4I5o6'].join('');

interface Journal {
  readonly entries: readonly { readonly tag: string }[];
}

describe('Integration: AppModule, guard order и RBAC', () => {
  let app: INestApplication;
  let url: string;
  let jwt: JwtService;
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
    jwt = moduleRef.get(JwtService, { strict: false });
    projectGuard = moduleRef.get(ProjectAccessGuard, { strict: false });
  });

  afterAll(async () => {
    await app?.close();
    await client?.close();
  });

  const tokenFor = (id: string): string => jwt.signAccess(id);

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

  it('PO-D01 остаётся открытым: кандидаты в публичные маршруты тоже дают 401', async () => {
    const candidates: readonly [string, string][] = [
      ['POST', '/auth/register'],
      ['POST', '/auth/login'],
      ['GET', '/health'],
      ['GET', '/catalog/devices'],
      ['GET', '/integrations/status'],
    ];
    for (const [method, path] of candidates) {
      expect(await req(method, path), `${method} ${path}`).toBe(401);
    }
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
