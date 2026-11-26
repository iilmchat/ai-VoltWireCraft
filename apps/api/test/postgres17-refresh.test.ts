// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * SEC-02 Stage 2 — обязательная проверка на реальном PostgreSQL 17.
 * Запускается только при VWC_PG17_URL (изолированная тестовая БД).
 * PGlite НЕ считается эквивалентом PostgreSQL 17.
 */

import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/database/drizzle.provider.js';
import { authRefreshTokens, authSessions, schema, users } from '../src/database/schema.js';
import { AuthService } from '../src/auth/auth.service.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { RefreshSessionService } from '../src/auth/refresh-session.service.js';

interface Journal {
  readonly entries: readonly { readonly tag: string }[];
}

const PG17_URL = process.env['VWC_PG17_URL'];
const migrationsFolder = fileURLToPath(new URL('../src/database/migrations', import.meta.url));
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TEST_PASSWORD = ['strong', 'password', '123'].join('-');

async function applyMigrationsAsync(pool: Pool, only?: string): Promise<void> {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')) as Journal;
  for (const entry of journal.entries) {
    if (only !== undefined && entry.tag !== only) {
      continue;
    }
    const sql = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (/vector/i.test(statement) || /normative_chunks/.test(statement)) {
        continue;
      }
      await pool.query(statement);
    }
  }
}

/** Внедрение отказа после N-го insert/update внутри транзакции PG17. */
function failingAfter(realDb: Database, operation: 'insert' | 'update', nth: number): Database {
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
                    return method.call(txTarget, ...args);
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

describe.skipIf(PG17_URL === undefined)('PostgreSQL 17 — SEC-02 Stage 2', () => {
  let pool: Pool;
  let db: Database;
  let config: never;
  let jwt: JwtService;
  let sessions: RefreshSessionService;

  beforeAll(async () => {
    pool = new Pool({ connectionString: PG17_URL, max: 5 });
    // Тестовая БД переиспользуется между прогонами: начинаем с чистого состояния.
    await pool.query(
      'DROP TABLE IF EXISTS "auth_refresh_tokens", "auth_sessions", "project_comments", "project_members", "floor_plans", "projects", "catalog_devices", "normative_chunks", "users" CASCADE',
    );
    await applyMigrationsAsync(pool);
    await pool.query('TRUNCATE "auth_refresh_tokens", "auth_sessions", "users" RESTART IDENTITY CASCADE');
    db = drizzle(pool, { schema });
    config = {
      get: (key: string): unknown => {
        if (key === 'JWT_SECRET') return 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
        if (key === 'JWT_KID') return 'pg17-kid';
        if (key === 'JWT_EXPIRES_IN') return '15m';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '30d';
        if (key === 'JWT_REFRESH_HASH_PEPPER') return 'b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f80912a';
        return undefined;
      },
    } as never;
    jwt = new JwtService(config);
    sessions = new RefreshSessionService(db, jwt, config);
    await db.insert(users).values([
      { id: USER, email: 'pg17-owner@example.test', passwordHash: 'hash', fullName: 'Owner' },
      { id: OTHER, email: 'pg17-other@example.test', passwordHash: 'hash', fullName: 'Other' },
    ]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('0003 применяется: таблицы и индексы созданы', async () => {
    const tables = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('auth_sessions','auth_refresh_tokens')",
    );
    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      'auth_refresh_tokens',
      'auth_sessions',
    ]);
    const indexes = await pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename='auth_refresh_tokens'",
    );
    const names = indexes.rows.map((row) => row.indexname);
    expect(names).toContain('auth_refresh_tokens_active_per_session');
    expect(names).toContain('auth_refresh_tokens_session_id_idx');
  });

  it('partial UNIQUE запрещает два активных refresh на сессию', async () => {
    const issued = await sessions.issueAsync(USER);
    await expect(
      db.insert(authRefreshTokens).values({
        sessionId: issued.sid,
        tokenHash: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow();
  });

  it('SELECT FOR UPDATE + параллельный refresh: один успех, второй 401 и отзыв family', async () => {
    const issued = await sessions.issueAsync(OTHER);
    const results = await Promise.allSettled([
      sessions.rotateAsync(issued.refreshToken),
      sessions.rotateAsync(issued.refreshToken),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [session] = await db.select().from(authSessions).where(eq(authSessions.id, issued.sid));
    expect(session?.revokedAt).not.toBeNull();
    expect(session?.revokeReason).toBe('replay');
  });

  it('replay после успешной ротации отзывает всю семью', async () => {
    const issued = await sessions.issueAsync(USER);
    const rotated = await sessions.rotateAsync(issued.refreshToken);
    await expect(sessions.verifyRefreshAsync(issued.refreshToken)).rejects.toThrow();
    await expect(sessions.rotateAsync(rotated.refreshToken)).rejects.toThrow();
    const [session] = await db.select().from(authSessions).where(eq(authSessions.id, issued.sid));
    expect(session?.revokedAt).not.toBeNull();
  });

  it('mid-transaction failure: rollback без half-state', async () => {
    const issued = await sessions.issueAsync(USER);
    const failing = new RefreshSessionService(failingAfter(db, 'insert', 1), jwt, config);
    await expect(failing.rotateAsync(issued.refreshToken)).rejects.toThrow(/injected/);
    const rows = await db.select().from(authRefreshTokens).where(eq(authRefreshTokens.sessionId, issued.sid));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.consumedAt).toBeNull();
    expect(rows[0]?.replacedByTokenId).toBeNull();
    const [session] = await db.select().from(authSessions).where(eq(authSessions.id, issued.sid));
    expect(session?.revokedAt).toBeNull();
  });

  it('атомарная регистрация: отказ после user оставляет БД чистой', async () => {
    const email = 'pg17-failed-registration@example.test';
    const failingDb = failingAfter(db, 'insert', 2);
    const failingSessions = new RefreshSessionService(failingDb, jwt, config);
    const failingAuth = new AuthService(failingDb, failingSessions);
    await expect(failingAuth.registerAsync({ email, password: TEST_PASSWORD, displayName: 'X' })).rejects.toThrow(
      /injected/,
    );
    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(0);
  });

  it('rollback 0003 и повторное применение на PG17', async () => {
    await pool.query('DROP TABLE IF EXISTS "auth_refresh_tokens"');
    await pool.query('DROP TABLE IF EXISTS "auth_sessions"');
    const after = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('auth_sessions','auth_refresh_tokens')",
    );
    expect(after.rows).toHaveLength(0);
    await applyMigrationsAsync(pool, '0003_refresh_sessions');
    const reapplied = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('auth_sessions','auth_refresh_tokens')",
    );
    expect(reapplied.rows).toHaveLength(2);
  });
});
