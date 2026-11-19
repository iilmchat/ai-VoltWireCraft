// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Детерминированный ключевой эмбеддинг для нормативных фрагментов. */

import { EMBEDDING_DIMENSIONS } from './schema.js';

/** Размерность эмбеддинга. */
export const EMBEDDING_SIZE = EMBEDDING_DIMENSIONS;

/**
 * Строит нормализованный вектор частот слов по хэш-бакетам.
 * Реализация не требует внешнего API и воспроизводима между запусками.
 *
 * @param text — текст фрагмента.
 * @returns вектор размером `EMBEDDING_DIMENSIONS`.
 */
export function buildKeywordEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_SIZE).fill(0);
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const bucket = Math.abs(hash) % EMBEDDING_SIZE;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}
