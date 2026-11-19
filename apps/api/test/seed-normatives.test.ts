// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Тесты парсера справочника ПУЭ-7 и детерминированного эмбеддинга. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildKeywordEmbedding, EMBEDDING_SIZE } from '../src/database/keyword-embedding.js';
import { NORMATIVE_DOCUMENT_CODE, parseNormativeMarkdown } from '../src/database/seed-normatives.js';

const markdownPath = fileURLToPath(
    new URL('../../../docs/domain/PUE_RULES_V02.md', import.meta.url),
);

describe('parseNormativeMarkdown', () => {
    it('разбирает реальный справочник в нормативные фрагменты', () => {
        const rows = parseNormativeMarkdown(readFileSync(markdownPath, 'utf8'));

        expect(rows.length).toBe(14);
        expect(rows.every((row) => row.documentCode === NORMATIVE_DOCUMENT_CODE)).toBe(true);
        expect(rows.some((row) => row.clause === 'PUE-1.3.4-T1-S2.5')).toBe(true);
        expect(rows.some((row) => row.clause === 'PUE-RCD-WET-30')).toBe(true);
    });

    it('каждый фрагмент содержит эмбеддинг нужной размерности', () => {
        const rows = parseNormativeMarkdown(readFileSync(markdownPath, 'utf8'));

        expect(rows.every((row) => row.embedding.length === EMBEDDING_SIZE)).toBe(true);
        expect(rows.every((row) => row.embedding.some((value) => value !== 0))).toBe(true);
    });

    it('не создаёт дубликаты по идентификатору пункта', () => {
        const rows = parseNormativeMarkdown(readFileSync(markdownPath, 'utf8'));
        const clauses = rows.map((row) => row.clause);

        expect(new Set(clauses).size).toBe(clauses.length);
    });

    it('отвергает строки без идентификатора PUE-*', () => {
        const rows = parseNormativeMarkdown('| `OTHER-1` | текст |\n| `PUE-TEST` | правило |');

        expect(rows).toHaveLength(1);
        expect(rows[0]?.clause).toBe('PUE-TEST');
    });
});

describe('buildKeywordEmbedding', () => {
    it('детерминирован и нормализован', () => {
        const first = buildKeywordEmbedding('УЗО 30 мА для розеток');
        const second = buildKeywordEmbedding('УЗО 30 мА для розеток');

        expect(first).toEqual(second);
        expect(first).toHaveLength(EMBEDDING_SIZE);
        expect(Math.sqrt(first.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1, 5);
    });
});
