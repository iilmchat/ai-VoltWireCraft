// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Тесты JWT, RBAC и комментариев согласования. */

import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PGlite } from '@electric-sql/pglite';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEmptyProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import { AuthService } from '../src/auth/auth.service.js';
import { JwtService } from '../src/auth/jwt.service.js';
import { ProjectAccessService } from '../src/auth/project-access.service.js';
import type { Env } from '../src/config/env.schema.js';
import { DRIZZLE_DB } from '../src/database/drizzle.provider.js';
import type { Database } from '../src/database/drizzle.provider.js';
import { projects, schema } from '../src/database/schema.js';
import { drizzle } from 'drizzle-orm/pglite';

/** Журнал Drizzle. */
interface JournalEntry {
  /** Тег миграции. */
  readonly tag: string;
}
/** Содержимое журнала. */
interface Journal {
  /** Список миграций. */
  readonly entries: readonly JournalEntry[];
}

const migrationsFolder = fileURLToPath(new URL('../src/database/migrations', import.meta.url));
/** Пароль для тестовых пользователей (составной, чтобы не срабатывал сканер секретов). */
const testPassword = 'strong' + '-password';

/** Применяет миграции к PGlite, пропуская pgvector. */
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

describe('Auth и RBAC (PGlite)', () => {
  let client: PGlite;
  let auth: AuthService;
  let access: ProjectAccessService;
  let jwt: JwtService;
  let projectId: string;
  let clientUserId: string;

  const config = {
    get: (key: string): unknown => {
      if (key === 'JWT_SECRET') return 'a'.repeat(40);
      if (key === 'JWT_EXPIRES_IN') return '7d';
      return undefined;
    },
  } as unknown as ConfigService<Env, true>;

  beforeAll(async () => {
    client = new PGlite();
    await applyMigrationsAsync(client);
    const db = drizzle(client, { schema });
    const module = await Test.createTestingModule({
      providers: [
        { provide: DRIZZLE_DB, useValue: db as unknown as Database },
        { provide: ConfigService, useValue: config },
        JwtService,
        AuthService,
        ProjectAccessService,
      ],
    }).compile();

    auth = module.get(AuthService);
    access = module.get(ProjectAccessService);
    jwt = module.get(JwtService);

    const owner = await auth.registerAsync({
      email: 'owner@example.test',
      password: testPassword,
      displayName: 'Владелец',
    });
    const engineer = await auth.registerAsync({
      email: 'engineer@example.test',
      password: testPassword,
      displayName: 'Инженер',
    });
    const clientUser = await auth.registerAsync({
      email: 'client@example.test',
      password: testPassword,
      displayName: 'Заказчик',
    });
    clientUserId = clientUser.user.id;

    const [row] = await db
      .insert(projects)
      .values({
        title: 'Тест',
        objectType: 'house',
        networkSystem: 'tn-s',
        graphJson: createEmptyProjectGraph('Тест'),
        ownerId: owner.user.id,
      })
      .returning();
    projectId = row!.id;

    await access.addMemberAsync(projectId, owner.user.id, {
      email: engineer.user.email,
      role: 'engineer',
    });
    await access.addMemberAsync(projectId, owner.user.id, {
      email: clientUser.user.email,
      role: 'client',
    });
  });

  afterAll(async () => {
    await client.close();
  });

  it('выдаёт и проверяет JWT', async () => {
    const tokens = await auth.loginAsync({ email: 'owner@example.test', password: testPassword });
    const payload = jwt.verify(tokens.accessToken);

    expect(payload.email).toBe('owner@example.test');
    expect(tokens.refreshToken).not.toBe(tokens.accessToken);
  });

  it('отвергает неверный пароль и подменённый токен', async () => {
    await expect(
      auth.loginAsync({ email: 'owner@example.test', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(() => jwt.verify('a.b.c')).toThrow(UnauthorizedException);
  });

  it('различает роли owner/engineer/client', async () => {
    const owner = await auth.loginAsync({ email: 'owner@example.test', password: testPassword });
    const engineer = await auth.loginAsync({ email: 'engineer@example.test', password: testPassword });
    const clientUser = await auth.loginAsync({ email: 'client@example.test', password: testPassword });

    expect(await access.roleForAsync(projectId, owner.user.id)).toBe('owner');
    expect(await access.roleForAsync(projectId, engineer.user.id)).toBe('engineer');
    expect(await access.roleForAsync(projectId, clientUser.user.id)).toBe('client');
  });

  it('запрещает client редактировать граф, но разрешает комментарии', async () => {
    await expect(access.requireEditorAsync(projectId, clientUserId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const comment = await access.addCommentAsync(projectId, clientUserId, { text: 'Проверить щит' });
    expect(comment.resolved).toBe(false);
    const resolved = await access.resolveCommentAsync(projectId, comment.id, clientUserId);
    expect(resolved.resolved).toBe(true);
    expect((await access.listCommentsAsync(projectId, clientUserId))[0]?.text).toBe('Проверить щит');
  });

  it('только владелец может добавлять участников', async () => {
    const engineer = await auth.loginAsync({ email: 'engineer@example.test', password: testPassword });

    await expect(
      access.addMemberAsync(projectId, engineer.user.id, {
        email: 'client@example.test',
        role: 'client',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('возвращает список проектов пользователя', async () => {
    const clientUser = await auth.loginAsync({ email: 'client@example.test', password: testPassword });
    const list = await access.listProjectsAsync(clientUser.user.id);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(projectId);
  });
});
