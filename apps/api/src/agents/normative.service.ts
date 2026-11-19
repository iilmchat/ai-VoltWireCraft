// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Поиск нормативных фрагментов ПУЭ-7 для цитирования ответов агентов. */

import { Inject, Injectable } from '@nestjs/common';
import { ilike, or, sql } from 'drizzle-orm';
import { DRIZZLE_DB } from '../database/drizzle.provider.js';
import type { Database } from '../database/drizzle.provider.js';
import { buildKeywordEmbedding } from '../database/keyword-embedding.js';
import { normativeChunks } from '../database/schema.js';
import type { PueCitation } from '@voltwirecraft/shared/graph.schema.js';

/** Строка результата поиска по эмбеддингам. */
type SimilarityRow = Record<string, unknown> & {
  /** Идентификатор пункта. */
  readonly clause: string;
  /** Текст пункта. */
  readonly content: string;
  /** Код документа. */
  readonly document_code: string;
};

/**
 * Сервис поиска по `normative_chunks`: ключевые слова и косинусная близость
 * детерминированного ключевого эмбеддинга (RULES § 5.1 — только цитаты,
 * никаких физических расчётов).
 */
@Injectable()
export class NormativeService {
  /**
   * @param db — типизированный Drizzle-клиент.
   */
  public constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /**
   * Ищет фрагменты по ключевым словам запроса.
   *
   * @param query — поисковый запрос.
   * @param limit — максимальное число цитат.
   * @returns цитаты с идентификаторами пунктов.
   */
  public async searchAsync(query: string, limit = 5): Promise<PueCitation[]> {
    const tokens = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 4);
    const conditions = tokens.map((token) => ilike(normativeChunks.content, `%${token}%`));
    const rows = await this.db
      .select()
      .from(normativeChunks)
      .where(conditions.length > 0 ? or(...conditions) : undefined)
      .limit(limit);

    return rows.map((row) => ({
      ruleId: row.clause,
      excerpt: row.content.slice(0, 400),
      document: row.documentCode,
    }));
  }

  /**
   * Ищет фрагменты по косинусной близости ключевого эмбеддинга (pgvector).
   *
   * @param query — поисковый запрос.
   * @param limit — максимальное число цитат.
   * @returns цитаты с идентификаторами пунктов.
   */
  public async searchByEmbeddingAsync(query: string, limit = 5): Promise<PueCitation[]> {
    const vector = `[${buildKeywordEmbedding(query).join(',')}]`;
    const result = await this.db.execute<SimilarityRow>(sql`
      SELECT clause, content, document_code
      FROM normative_chunks
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${limit}
    `);

    return result.rows.map((row) => ({
      ruleId: row.clause,
      excerpt: row.content.slice(0, 400),
      document: row.document_code,
    }));
  }
}
