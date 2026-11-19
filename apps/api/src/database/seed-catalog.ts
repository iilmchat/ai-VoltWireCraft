// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Сид каталога модульного оборудования (RULES § 2.1, 6.2). */

import 'reflect-metadata';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { CATALOG_SEED_ROWS } from './catalog-seed-data.js';
import { catalogDevices, schema } from './schema.js';

/** Переменные окружения, необходимые для сида. */
const SeedEnvSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine((value) => /^postgres(?:ql)?:\/\//.test(value), {
      message: 'Ожидается строка подключения PostgreSQL',
    }),
});

/**
 * Заполняет каталог базовыми позициями. Повторный запуск безопасен:
 * артикулы, уже существующие в базе, пропускаются.
 *
 * @returns nothing.
 * @throws {ZodError} если не задана или некорректна `DATABASE_URL`.
 * @throws {Error} если вставка завершилась неудачей.
 */
async function seedAsync(): Promise<void> {
  const env = SeedEnvSchema.parse(process.env);
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    await db
      .insert(catalogDevices)
      .values([...CATALOG_SEED_ROWS])
      .onConflictDoNothing({ target: catalogDevices.sku });
    console.log(`Каталог заполнен: обработано позиций — ${CATALOG_SEED_ROWS.length}`);
  } finally {
    await pool.end();
  }
}

void seedAsync();
