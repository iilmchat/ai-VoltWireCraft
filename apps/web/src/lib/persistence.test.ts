// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { createEmptyProjectGraph } from '@voltwirecraft/shared';
import type { ProjectGraph } from '@voltwirecraft/shared';
import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from './persistence.js';

describe('persistence', () => {
    it('сериализует и разбирает проект без потерь', () => {
        const graph = createEmptyProjectGraph('Тестовый проект');
        const result = parseProject(serializeProject(graph));
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.graph).toEqual(graph);
        }
    });

    it('отвергает некорректный JSON', () => {
        expect(parseProject('{')).toEqual({ ok: false, code: 'invalidJson' });
    });

    it('отвергает чужой формат файла', () => {
        expect(parseProject(JSON.stringify({ format: 'other', schemaVersion: 1, graph: {} }))).toEqual({
            ok: false,
            code: 'invalidFormat',
        });
    });

    it('сообщает о более новой версии файла', () => {
        expect(parseProject(JSON.stringify({ format: 'vwc-project', schemaVersion: 2, graph: {} }))).toEqual({
            ok: false,
            code: 'newerVersion',
        });
    });

    it('сообщает о более старой версии файла', () => {
        expect(parseProject(JSON.stringify({ format: 'vwc-project', schemaVersion: 0, graph: {} }))).toEqual({
            ok: false,
            code: 'olderVersion',
        });
    });

    it('отвергает граф, не прошедший валидацию', () => {
        const graph = createEmptyProjectGraph();
        const invalid = { ...graph, schemaVersion: 2 } as unknown as ProjectGraph;
        const text = JSON.stringify({
            format: 'vwc-project',
            schemaVersion: 1,
            graph: invalid,
            savedAt: new Date().toISOString(),
        });
        expect(parseProject(text)).toEqual({ ok: false, code: 'invalidGraph' });
    });
});
