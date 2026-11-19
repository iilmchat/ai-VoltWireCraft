// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Применяет сгенерированные миграции к PostgreSQL (RULES § 4.3). */

import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { schema } from './schema.js';

/** Переменные окружения, необходимые мигратору. */
const MigrationEnvSchema = z.object({
  DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:\/\//.test(value), {
    message: 'Ожидается строка подключения PostgreSQL',
  }),
});

/** Каталог миграций рядом с этим файлом. */
const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * Применяет миграции и закрывает пул соединений.
 *
 * @returns nothing.
 * @throws {Error} если конфигурация или миграции некорректны.
 */
async function migrateAsync(): Promise<void> {
  const env = MigrationEnvSchema.parse(process.env);
  if (!existsSync(migrationsFolder)) {
    throw new Error(`Каталог миграций не найден: ${migrationsFolder}`);
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool, { schema }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

void migrateAsync();
