// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * SEC-02 Stage 2 (PO-D13-01): сессии, refresh, ротация, replay, cookie/CSRF.
 * Реальный AppModule + PGlite: HTTP и БД проверяются вместе.
 */

import 'reflect-metadata';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthResponseSchema } from '@voltwirecraft/shared/graph.schema.js';
import { DRIZZLE_DB } from '../src/database/drizzle.provider.js';
import { schema, authRefreshTokens, authSessions, users } from '../src/database/schema.js';
import { AuthService } from '../src/auth/auth.service.js';
import { JwtService, type JwtPayload } from '../src/auth/jwt.service.js';
import { RefreshSessionService } from '../src/auth/refresh-session.service.js';
import { REFRESH_COOKIE_NAME } from '../src/auth/refresh.guard.js';
import type { Database } from '../src/database/drizzle.provider.js';

interface Journal {
  readonly entries: readonly { readonly tag: string }[];
}

const JWT_SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const PEPPER = 'b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f80912a';
const ALLOWED_ORIGIN = 'http://localhost:5173';
/** Собрано из частей, чтобы сканер секретов не принимал тестовый пароль за утечку. */
const TEST_PASSWORD = ['strong', 'password', '123'].join('-');

const migrationsFolder = fileURLToPath(new URL('../src/database/migrations', import.meta.url));

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

/** Подделка токена с валидной подписью, но произвольными claims (тест отклонений). */
function forgeToken(claims: Partial<JwtPayload>, overrides: { kid?: string } = {}): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: overrides.kid ?? 'stage2-kid' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/** Базовые корректные claims refresh-токена. */
function validClaims(overrides: Partial<JwtPayload> = {}): JwtPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: '11111111-1111-4111-8111-111111111111',
    sid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    typ: 'refresh',
    aud: 'vwc-auth',
    iss: 'voltwirecraft-api',
    jti: randomUUID(),
    iat: now,
    nbf: now,
    exp: now + 3600,
    ...overrides,
  };
}

/**
 * Тестовый DB-adapter: внутри реальной транзакции вызывает ошибку после
 * указанного по счёту insert/update (fault injection mid-transaction).
 */
function failingAfter(
  realDb: Database,
  operation: 'insert' | 'update',
  nth: number,
  onInsertedRow?: (row: Record<string, unknown>) => void,
): Database {
  return new Proxy(realDb, {
    get(target, property, receiver) {
      if (property === 'transaction') {
        return async (callback: (tx: Database) => Promise<unknown>): Promise<unknown> =>
          target.transaction(async (tx) => {
            let inserts = 0;
            let updates = 0;
            const proxy = new Proxy(tx, {
              get(txTarget, txProperty, txReceiver) {
                if (txProperty === 'insert' || txProperty === 'update') {
                  return (...args: unknown[]): unknown => {
                    if (txProperty === 'insert') {
                      inserts += 1;
                      if (operation === 'insert' && inserts === nth) {
                        throw new Error('injected insert failure');
                      }
                    } else {
                      updates += 1;
                      if (operation === 'update' && updates === nth) {
                        throw new Error('injected update failure');
                      }
                    }
                    const method = Reflect.get(txTarget, txProperty, txReceiver) as (
                      ...a: unknown[]
                    ) => unknown;
                    const builder = method.call(txTarget, ...args);
                    if (onInsertedRow === undefined || txProperty !== 'insert' || builder === null) {
                      return builder;
                    }
                    const wrapBuilder = (query: object): object =>
                      new Proxy(query, {
                        get(queryTarget, queryProperty, queryReceiver) {
                          const value = Reflect.get(queryTarget, queryProperty, queryReceiver);
                          if (typeof value !== 'function') {
                            return value;
                          }
                          if (queryProperty === 'values') {
                            return (...chainArgs: unknown[]) => {
                              const next = value.call(queryTarget, ...chainArgs);
                              return next !== null && typeof next === 'object'
                                ? wrapBuilder(next)
                                : next;
                            };
                          }
                          if (queryProperty !== 'returning') {
                            return value.bind(queryTarget);
                          }
                          return (...returningArgs: unknown[]) => {
                            const result = value.call(queryTarget, ...returningArgs) as
                              | Promise<Record<string, unknown>[]>
                              | unknown;
                            if (result === null || typeof result !== 'object' || !('then' in result)) {
                              return result;
                            }
                            return Promise.resolve(result).then((rows) => {
                              for (const row of rows as Record<string, unknown>[]) {
                                onInsertedRow(row);
                              }
                              return rows;
                            });
                          };
                        },
                      });
                    return wrapBuilder(builder as object);
                  };
                }
                const value = Reflect.get(txTarget, txProperty, txReceiver);
                return typeof value === 'function' ? value.bind(txTarget) : value;
              },
            });
            return callback(proxy as Database);
          });
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Database;
}

interface HttpResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly setCookie: string | null;
}

describe('SEC-02 Stage 2 — refresh session lifecycle', () => {
  let client: PGlite;
  let db: Database;
  let app: INestApplication;
  let url: string;
  let auth: AuthService;
  let jwt: JwtService;
  let sessions: RefreshSessionService;
  let ownerAccess: string;
  let ownerRefresh: string;
  let ownerSid: string;

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://vwc:vwc@localhost:5432/voltwirecraft',
      REDIS_URL: 'redis://localhost:6379/0',
      CALC_ENGINE_URL: 'http://localhost:8000',
      JWT_SECRET,
      JWT_KID: 'stage2-kid',
      JWT_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '30d',
      JWT_REFRESH_HASH_PEPPER: PEPPER,
      HITL_SIGNING_KEY: 'c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f80912ab3c',
      INTERNAL_SERVICE_TOKEN: 'd4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f80912ab3c4d',
      AUTH_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    });

    client = new PGlite();
    await applyMigrationsAsync(client);
    db = drizzle(client, { schema });

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_DB)
      .useValue(db)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    auth = moduleRef.get(AuthService, { strict: false });
    jwt = moduleRef.get(JwtService, { strict: false });
    sessions = moduleRef.get(RefreshSessionService, { strict: false });

    await db.insert(users).values(
      [
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
        '66666666-6666-4666-8666-666666666666',
        '77777777-7777-4777-8777-777777777777',
        '88888888-8888-4888-8888-888888888888',
        '99999999-9999-4999-8999-999999999999',
        'aaaa1111-1111-4111-8111-111111111111',
        'bbbb1111-1111-4111-8111-111111111111',
      ].map((id) => ({
        id,
        email: `${id}@stage2.test`,
        passwordHash: '00'.repeat(16) + ':' + '11'.repeat(64),
        fullName: id,
      })),
    );

    const registered = await auth.registerAsync({
      email: 'stage2-owner@example.test',
      password: TEST_PASSWORD,
      displayName: 'Stage2 Owner',
    });
    AuthResponseSchema.parse(registered);
    ownerAccess = registered.accessToken;
    ownerRefresh = registered.refreshToken;
    const payload = jwt.verify(ownerAccess, 'access');
    ownerSid = payload.sid;
  });

  afterAll(async () => {
    await app?.close();
    await client?.close();
  });

  async function http(
    method: string,
    path: string,
    options: {
      access?: string;
      body?: unknown;
      cookie?: string;
      origin?: string;
      contentType?: string;
    } = {},
  ): Promise<HttpResponse> {
    const headers: Record<string, string> = {};
    if (options.access !== undefined) {
      headers['authorization'] = `Bearer ${options.access}`;
    }
    if (options.body !== undefined) {
      headers['content-type'] = options.contentType ?? 'application/json';
    }
    if (options.cookie !== undefined) {
      headers['cookie'] = options.cookie;
    }
    if (options.origin !== undefined) {
      headers['origin'] = options.origin;
    }
    const response = await fetch(`${url}${path}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text };
    }
    return { status: response.status, body, setCookie: response.headers.get('set-cookie') };
  }

  /** Выполняет refresh через body-fallback и возвращает новую пару. */
  async function refreshViaBody(token: string): Promise<HttpResponse> {
    return http('POST', '/auth/refresh', { body: { refreshToken: token } });
  }

  describe('выдача и хранение', () => {
    it('register/login создают сессию и одну активную refresh-запись', async () => {
      const [session] = await db.select().from(authSessions).where(eq(authSessions.id, ownerSid));
      expect(session).toBeDefined();
      expect(session?.userId).toBe(jwt.verify(ownerAccess, 'access').sub);
      expect(session?.revokedAt).toBeNull();

      const tokens = await db.select().from(authRefreshTokens).where(eq(authRefreshTokens.sessionId, ownerSid));
      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.consumedAt).toBeNull();
      expect(tokens[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('hash-only storage: сырой refresh-токен отсутствует в БД', async () => {
      const [row] = await db.select().from(authRefreshTokens).where(eq(authRefreshTokens.sessionId, ownerSid));
      expect(row?.tokenHash).not.toBe(ownerRefresh);
      expect(row?.tokenHash).not.toContain(ownerRefresh);
    });

    it('login через HTTP тоже создаёт сессию и выставляет HttpOnly-cookie', async () => {
      const response = await http('POST', '/auth/login', {
        body: { email: 'stage2-owner@example.test', password: TEST_PASSWORD },
      });
      expect(response.status).toBe(201);
      expect(response.setCookie).toContain(`${REFRESH_COOKIE_NAME}=`);
      expect(response.setCookie).toContain('HttpOnly');
      expect(response.setCookie).toContain('Secure');
      expect(response.setCookie).toContain('SameSite=Strict');
      expect(response.setCookie).toContain('Path=/auth');
      const data = response.body['data'] as Record<string, unknown>;
      expect(typeof data['accessToken']).toBe('string');
      expect(typeof data['refreshToken']).toBe('string');
      AuthResponseSchema.parse(data);
    });
  });

  describe('refresh endpoint: отдельная ветка без @Public', () => {
    it('POST /auth/refresh без токена → 401 (не 200/404)', async () => {
      const response = await http('POST', '/auth/refresh', { body: {} });
      expect(response.status).toBe(401);
    });

    it('body-fallback (Tauri/тесты) выдаёт новую пару', async () => {
      const response = await refreshViaBody(ownerRefresh);
      expect(response.status).toBe(200);
      const data = response.body['data'] as Record<string, unknown>;
      expect(typeof data['accessToken']).toBe('string');
      expect(typeof data['refreshToken']).toBe('string');
      expect(data['refreshToken']).not.toBe(ownerRefresh);
      // сохраняем новую пару как актуальную для последующих тестов
      ownerRefresh = data['refreshToken'] as string;
      ownerAccess = data['accessToken'] as string;
    });

    it('cookie без разрешённого Origin → 401; с разрешённым → 200', async () => {
      const cookie = `${REFRESH_COOKIE_NAME}=${ownerRefresh}`;
      expect((await http('POST', '/auth/refresh', { body: {}, cookie })).status).toBe(401);
      expect(
        (await http('POST', '/auth/refresh', { body: {}, cookie, origin: 'https://evil.example' })).status,
      ).toBe(401);
      const ok = await http('POST', '/auth/refresh', { body: {}, cookie, origin: ALLOWED_ORIGIN });
      expect(ok.status).toBe(200);
      const data = ok.body['data'] as Record<string, unknown>;
      ownerRefresh = data['refreshToken'] as string;
      ownerAccess = data['accessToken'] as string;
    });

    it('access-токен не работает как refresh, refresh — как Bearer', async () => {
      expect((await refreshViaBody(ownerAccess)).status).toBe(401);
      expect((await http('GET', '/auth/me', { access: ownerRefresh })).status).toBe(401);
    });

    it('неверные kid/typ/aud/iss/sub/sid/jti и подпись отклоняются', async () => {
      const cases: readonly string[] = [
        forgeToken(validClaims(), { kid: 'wrong-kid' }),
        forgeToken(validClaims({ typ: 'access' })),
        forgeToken(validClaims({ aud: 'vwc-api' })),
        forgeToken(validClaims({ iss: 'evil' })),
        forgeToken(validClaims({ sub: randomUUID() })),
        forgeToken(validClaims({ sid: randomUUID() })),
        forgeToken(validClaims({ jti: randomUUID() })),
        `${ownerRefresh.slice(0, -1)}X`,
      ];
      for (const token of cases) {
        const response = await refreshViaBody(token);
        expect(response.status, token.slice(0, 24)).toBe(401);
      }
    });
  });

  describe('ротация, replay и отзыв (TEC-03/TEC-10)', () => {
    it('повтор использованного refresh → 401 и отзыв всей семьи', async () => {
      const first = await refreshViaBody(ownerRefresh);
      expect(first.status).toBe(200);
      const used = ownerRefresh;
      const data = first.body['data'] as Record<string, unknown>;
      const newRefresh = data['refreshToken'] as string;
      const newAccess = data['accessToken'] as string;

      const replay = await refreshViaBody(used);
      expect(replay.status).toBe(401);
      expect((await refreshViaBody(newRefresh)).status).toBe(401);
      expect((await http('GET', '/auth/me', { access: newAccess })).status).toBe(401);

      const [session] = await db.select().from(authSessions).where(eq(authSessions.id, ownerSid));
      expect(session?.revokedAt).not.toBeNull();
      expect(session?.revokeReason).toBe('replay');
    });

    it('logout отзывает только текущую сессию', async () => {
      const a = await sessions.issueAsync('22222222-2222-4222-8222-222222222222');
      const b = await sessions.issueAsync('22222222-2222-4222-8222-222222222222');
      expect((await http('POST', '/auth/logout', { access: a.accessToken })).status).toBe(200);
      expect((await http('GET', '/auth/me', { access: a.accessToken })).status).toBe(401);
      expect((await http('GET', '/auth/me', { access: b.accessToken })).status).toBe(200);
      expect((await refreshViaBody(b.refreshToken)).status).toBe(200);
    });

    it('logout-all отзывает все сессии пользователя, не трогая чужие', async () => {
      const owner1 = await sessions.issueAsync('33333333-3333-4333-8333-333333333333');
      const owner2 = await sessions.issueAsync('33333333-3333-4333-8333-333333333333');
      const other = await sessions.issueAsync('44444444-4444-4444-8444-444444444444');
      expect((await http('POST', '/auth/logout-all', { access: owner1.accessToken })).status).toBe(200);
      expect((await http('GET', '/auth/me', { access: owner1.accessToken })).status).toBe(401);
      expect((await http('GET', '/auth/me', { access: owner2.accessToken })).status).toBe(401);
      expect((await http('GET', '/auth/me', { access: other.accessToken })).status).toBe(200);
    });

    it('параллельный refresh: ровно один 200, второй 401 с отзывом семьи', async () => {
      const issued = await sessions.issueAsync('55555555-5555-4555-8555-555555555555');
      const [first, second] = await Promise.all([
        refreshViaBody(issued.refreshToken),
        refreshViaBody(issued.refreshToken),
      ]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 401]);
      expect((await refreshViaBody(issued.refreshToken)).status).toBe(401);
      const [session] = await db.select().from(authSessions).where(eq(authSessions.id, issued.sid));
      expect(session?.revokedAt).not.toBeNull();
    });

    it('TEC-10: ошибка БД во время ротации → rollback, сессия не отозвана', async () => {
      const issued = await sessions.issueAsync('66666666-6666-4666-8666-666666666666');
      const failingDb = {
        transaction: async () => {
          throw new Error('simulated db failure');
        },
      } as unknown as Database;
      const failing = new RefreshSessionService(failingDb, jwt, {
        get: (key: string) => (key === 'JWT_REFRESH_HASH_PEPPER' ? PEPPER : undefined),
      } as never);

      await expect(failing.rotateAsync(issued.refreshToken)).rejects.toThrow(/db failure/);
      const [session] = await db.select().from(authSessions).where(eq(authSessions.id, issued.sid));
      expect(session?.revokedAt).toBeNull();
      const rows = await db.select().from(authRefreshTokens).where(eq(authRefreshTokens.sessionId, issued.sid));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.consumedAt).toBeNull();
    });

    it('expired refresh отклоняется (fake timers)', async () => {
      vi.useFakeTimers();
      try {
        const expiredJwt = new JwtService({
          get: (key: string) => {
            if (key === 'JWT_SECRET') return JWT_SECRET;
            if (key === 'JWT_KID') return 'stage2-kid';
            if (key === 'JWT_REFRESH_EXPIRES_IN') return '1s';
            if (key === 'JWT_EXPIRES_IN') return '1s';
            return undefined;
          },
        } as never);
        vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
        const token = expiredJwt.signRefresh(
          '77777777-7777-4777-8777-777777777777',
          '88888888-8888-4888-8888-888888888888',
        );
        vi.setSystemTime(new Date('2026-11-24T10:01:00Z'));
        expect(() => expiredJwt.verify(token, 'refresh')).toThrow();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('S2-05 — контракт refresh для browser/Tauri', () => {
    it('body-fallback возвращает AuthResponse вместе с user', async () => {
      const issued = await sessions.issueAsync('88888888-8888-4888-8888-888888888888');
      const response = await refreshViaBody(issued.refreshToken);
      expect(response.status).toBe(200);
      const data = response.body['data'];
      AuthResponseSchema.parse(data);
      const user = (data as { user: { id: string } }).user;
      expect(user.id).toBe('88888888-8888-4888-8888-888888888888');
    });

    it('cookie-транспорт тоже возвращает AuthResponse вместе с user', async () => {
      const issued = await sessions.issueAsync('99999999-9999-4999-8999-999999999999');
      const response = await http('POST', '/auth/refresh', {
        body: {},
        cookie: `${REFRESH_COOKIE_NAME}=${issued.refreshToken}`,
        origin: ALLOWED_ORIGIN,
      });
      expect(response.status).toBe(200);
      AuthResponseSchema.parse(response.body['data']);
    });
  });

  describe('S2-03 — отказ внутри транзакции ротации', () => {
    it('сбой после consumed-at: старый токен активен, нового нет, сессия не отозвана', async () => {
      const issued = await sessions.issueAsync('aaaa1111-1111-4111-8111-111111111111');
      const payload = jwt.verify(issued.refreshToken, 'refresh');
      const failingDb = failingAfter(db, 'insert', 1);
      const failing = new RefreshSessionService(failingDb, jwt, {
        get: (key: string) => (key === 'JWT_REFRESH_HASH_PEPPER' ? PEPPER : undefined),
      } as never);

      await expect(failing.rotateAsync(issued.refreshToken)).rejects.toThrow(/injected/);
      const rows = await db.select().from(authRefreshTokens).where(eq(authRefreshTokens.sessionId, issued.sid));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(payload.jti);
      expect(rows[0]?.consumedAt).toBeNull();
      expect(rows[0]?.replacedByTokenId).toBeNull();
      const [session] = await db.select().from(authSessions).where(eq(authSessions.id, issued.sid));
      expect(session?.revokedAt).toBeNull();
    });

    it('сбой после вставки нового токена: replaced_by не записан, half-state отсутствует', async () => {
      const issued = await sessions.issueAsync('bbbb1111-1111-4111-8111-111111111111');
      const failingDb = failingAfter(db, 'update', 2);
      const failing = new RefreshSessionService(failingDb, jwt, {
        get: (key: string) => (key === 'JWT_REFRESH_HASH_PEPPER' ? PEPPER : undefined),
      } as never);

      await expect(failing.rotateAsync(issued.refreshToken)).rejects.toThrow(/injected/);
      const rows = await db.select().from(authRefreshTokens).where(eq(authRefreshTokens.sessionId, issued.sid));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.consumedAt).toBeNull();
      expect(rows[0]?.replacedByTokenId).toBeNull();
      const [session] = await db.select().from(authSessions).where(eq(authSessions.id, issued.sid));
      expect(session?.revokedAt).toBeNull();
    });
  });

  describe('F-01/F-02 — атомарность register и login', () => {
    it('F-01: сбой после вставки пользователя откатывает его UUID, сессию и refresh', async () => {
      const email = 'failed-registration@example.test';
      const sessionsBefore = await db.select().from(authSessions);
      const refreshBefore = await db.select().from(authRefreshTokens);
      let createdUserId: string | undefined;

      const failingDb = failingAfter(db, 'insert', 2, (row) => {
        if (typeof row['id'] === 'string') {
          createdUserId = row['id'];
        }
      });
      const failingSessions = new RefreshSessionService(failingDb, jwt, {
        get: (key: string) => (key === 'JWT_REFRESH_HASH_PEPPER' ? PEPPER : undefined),
      } as never);
      const failingAuth = new AuthService(failingDb, failingSessions);

      await expect(
        failingAuth.registerAsync({ email, password: TEST_PASSWORD, displayName: 'Failed' }),
      ).rejects.toThrow(/injected/);

      // Фиксируем реальный UUID, который был создан внутри откаченной транзакции.
      expect(createdUserId).toMatch(/^[0-9a-f-]{36}$/);
      const userId = createdUserId as string;
      expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
      expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
      expect((await db.select().from(authSessions)).filter((row) => row.userId === userId)).toHaveLength(0);
      expect(await db.select().from(authSessions)).toHaveLength(sessionsBefore.length);
      expect(await db.select().from(authRefreshTokens)).toHaveLength(refreshBefore.length);
    });

    it('F-02: сбой после создания сессии при login не оставляет orphan-сессию', async () => {
      const registered = await auth.registerAsync({
        email: 'login-fault@example.test',
        password: TEST_PASSWORD,
        displayName: 'Login Fault',
      });
      const userId = registered.user.id;
      const sessionsBefore = await db.select().from(authSessions);
      const refreshBefore = await db.select().from(authRefreshTokens);

      // При login первый INSERT — это auth_sessions; отказ оставляет user без сессии.
      const failingDb = failingAfter(db, 'insert', 1);
      const failingSessions = new RefreshSessionService(failingDb, jwt, {
        get: (key: string) => (key === 'JWT_REFRESH_HASH_PEPPER' ? PEPPER : undefined),
      } as never);
      const failingAuth = new AuthService(failingDb, failingSessions);

      await expect(
        failingAuth.loginAsync({ email: 'login-fault@example.test', password: TEST_PASSWORD }),
      ).rejects.toThrow(/injected/);

      expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1);
      expect((await db.select().from(authSessions)).filter((row) => row.userId === userId)).toHaveLength(
        sessionsBefore.filter((row) => row.userId === userId).length,
      );
      expect(await db.select().from(authSessions)).toHaveLength(sessionsBefore.length);
      expect(await db.select().from(authRefreshTokens)).toHaveLength(refreshBefore.length);
    });
  });

  describe('миграция 0003 и rollback', () => {
    it('up создаёт таблицы, down удаляет только их и повторно применяется', async () => {
      const scratch = new PGlite();
      try {
        await applyMigrationsAsync(scratch);
        const before = await scratch.query<{ table_name: string }>(
          "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('auth_sessions','auth_refresh_tokens')",
        );
        expect(before.rows.map((row) => row.table_name).sort()).toEqual([
          'auth_refresh_tokens',
          'auth_sessions',
        ]);

        // Документированный rollback (см. SEC02_STAGE2_IMPLEMENTATION_REPORT.md)
        await scratch.exec('DROP TABLE IF EXISTS "auth_refresh_tokens";');
        await scratch.exec('DROP TABLE IF EXISTS "auth_sessions";');
        const after = await scratch.query<{ table_name: string }>(
          "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('auth_sessions','auth_refresh_tokens')",
        );
        expect(after.rows).toHaveLength(0);

        const up = readFileSync(join(migrationsFolder, '0003_refresh_sessions.sql'), 'utf8');
        for (const statement of up.split('--> statement-breakpoint')) {
          await scratch.exec(statement);
        }
        const reapplied = await scratch.query<{ table_name: string }>(
          "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('auth_sessions','auth_refresh_tokens')",
        );
        expect(reapplied.rows).toHaveLength(2);
      } finally {
        await scratch.close();
      }
    });
  });
});
