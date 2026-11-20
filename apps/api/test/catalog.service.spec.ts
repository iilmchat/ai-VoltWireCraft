// © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
/** Интеграционные тесты каталога на PGlite. */

import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DRIZZLE_DB } from '../src/database/drizzle.provider.js';
import type { Database } from '../src/database/drizzle.provider.js';
import { CATALOG_SEED_ROWS } from '../src/database/catalog-seed-data.js';
import { catalogDevices, schema } from '../src/database/schema.js';
import { CatalogQuerySchema } from '../src/catalog/catalog.dto.js';
import { CatalogService } from '../src/catalog/catalog.service.js';

const migrationsFolder = fileURLToPath(
  new URL('../src/database/migrations', import.meta.url),
);

/** Применяет миграции, пропуская pgvector-зависимые операторы для PGlite. */
async function applyMigrationsAsync(client: PGlite): Promise<void> {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: readonly { tag: string }[] };

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

describe('CatalogService (интеграционные тесты)', () => {
  let client: PGlite;
  let service: CatalogService;

  beforeAll(async () => {
    client = new PGlite();
    await applyMigrationsAsync(client);
    const db = drizzle(client, { schema });
    await db.insert(catalogDevices).values([...CATALOG_SEED_ROWS]);

    const module = await Test.createTestingModule({
      providers: [CatalogService, { provide: DRIZZLE_DB, useValue: db as unknown as Database }],
    }).compile();
    service = module.get(CatalogService);
  });

  afterAll(async () => {
    await client.close();
  });

  it('возвращает первую страницу и общее число позиций', async () => {
    const result = await service.listAsync(CatalogQuerySchema.parse({}));

    expect(result.total).toBe(48);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.items).toHaveLength(20);
  });

  it('фильтрует по бренду и типу устройства', async () => {
    const result = await service.listAsync(
      CatalogQuerySchema.parse({ brand: 'IEK', deviceType: 'circuit_breaker' }),
    );

    expect(result.total).toBe(18);
    expect(result.items.every((item) => item.brand === 'IEK')).toBe(true);
    expect(result.items.every((item) => item.deviceType === 'circuit_breaker')).toBe(true);
  });

  it('фильтрует по номинальному току и поддерживает пагинацию', async () => {
    const first = await service.listAsync(
      CatalogQuerySchema.parse({ ratedCurrentA: 16, pageSize: 3, page: 1 }),
    );
    const second = await service.listAsync(
      CatalogQuerySchema.parse({ ratedCurrentA: 16, pageSize: 3, page: 2 }),
    );

    expect(first.total).toBeGreaterThan(3);
    expect(first.items).toHaveLength(3);
    expect(second.items).toHaveLength(3);
    expect(first.items[0]?.sku).not.toBe(second.items[0]?.sku);
  });

  it('отвергает некорректные параметры запроса', () => {
    expect(CatalogQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(CatalogQuerySchema.safeParse({ brand: 'UNKNOWN' }).success).toBe(false);
  });
});
