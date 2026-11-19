// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Парсер-сидер нормативных пунктов ПУЭ-7 в таблицу `normative_chunks`. */

import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { buildKeywordEmbedding } from './keyword-embedding.js';
import { normativeChunks, schema } from './schema.js';
import type { normativeChunks as NormativeTable } from './schema.js';

/** Код документа, под которым сохраняются пункты справочника. */
export const NORMATIVE_DOCUMENT_CODE = 'PUE-7';

/** Строка нормативного фрагмента для вставки. */
export type NormativeChunkInsert = typeof NormativeTable.$inferInsert;

/** Переменные окружения, необходимые сиду. */
const SeedEnvSchema = z.object({
  DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:\/\//.test(value), {
    message: 'Ожидается строка подключения PostgreSQL',
  }),
});

/**
 * Разбирает markdown-справочник `PUE_RULES_V02.md` в нормативные фрагменты.
 * Каждая строка таблицы с идентификатором `PUE-…` становится отдельным чанком.
 *
 * @param markdown — содержимое файла справочника.
 * @returns массив фрагментов с детерминированными эмбеддингами.
 */
export function parseNormativeMarkdown(markdown: string): NormativeChunkInsert[] {
  const rows: NormativeChunkInsert[] = [];
  let section = '';
  const seen = new Set<string>();

  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading !== null) {
      section = heading[1]!.trim();
      continue;
    }

    const match = /^\|\s*`([^`]+)`\s*\|(.+)\|\s*$/.exec(line);
    if (match === null) {
      continue;
    }
    const clause = match[1]!.trim();
    const cells = match[2]!
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    if (!clause.startsWith('PUE-') || seen.has(clause)) {
      continue;
    }
    seen.add(clause);

    const content = `${section}. ${cells.join(' · ')}`;
    rows.push({
      documentCode: NORMATIVE_DOCUMENT_CODE,
      clause,
      content,
      embedding: buildKeywordEmbedding(content),
      metadata: {
        section,
        edition: 'ПУЭ-7',
        cells,
        source: 'docs/domain/PUE_RULES_V02.md',
      },
    });
  }

  return rows;
}

/**
 * Загружает справочник в базу. Повторный запуск безопасен:
 * уже существующие пункты пропускаются.
 *
 * @returns nothing.
 * @throws {ZodError} если не задана или некорректна `DATABASE_URL`.
 */
export async function seedNormativesAsync(): Promise<void> {
  const env = SeedEnvSchema.parse(process.env);
  const path = fileURLToPath(new URL('../../../docs/domain/PUE_RULES_V02.md', import.meta.url));
  const rows = parseNormativeMarkdown(await readFile(path, 'utf8'));
  if (rows.length === 0) {
    throw new Error('Справочник ПУЭ не содержит ни одного пункта с идентификатором PUE-*');
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    await db
      .insert(normativeChunks)
      .values(rows)
      .onConflictDoNothing({ target: [normativeChunks.documentCode, normativeChunks.clause] });
    console.log(`Нормативные фрагменты загружены: ${rows.length}`);
  } finally {
    await pool.end();
  }
}

/** Запускает сид только при прямом вызове скрипта (не при импорте в тестах). */
const entryPoint = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (entryPoint === fileURLToPath(import.meta.url)) {
  void seedNormativesAsync();
}
