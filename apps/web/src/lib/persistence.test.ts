// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { createEmptyProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import type { ProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import { describe, expect, it } from 'vitest';
import {
    SUPPORTED_SCHEMA_VERSION,
    parseProject,
    serializeProject,
} from './persistence.js';

/** Идентификатор графа для тестов. */
const GRAPH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
/** Идентификатор узла-источника. */
const SOURCE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
/** Идентификатор узла-розетки. */
const SOCKET_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
/** Идентификатор кабельной линии. */
const EDGE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/**
 * Создать валидный канонический граф версии 2.
 * @returns Граф проекта с узлами и линией.
 */
function makeGraph(): ProjectGraph {
    const empty = createEmptyProjectGraph('Тестовый проект', GRAPH_ID);
    return {
        ...empty,
        floorPlan: { ...empty.floorPlan, scaleMetersPerPx: 0.01 },
        nodes: [
            {
                id: SOURCE_ID,
                kind: 'input_source',
                label: 'Ввод',
                planPosition: null,
                panelSlot: 1,
                specs: { ratedPower: 0, ratedCurrent: 63, crossSection: 10, mountingHeight: 1.8 },
            },
            {
                id: SOCKET_ID,
                kind: 'socket',
                label: 'Розетка',
                planPosition: { x: 1, y: 2 },
                panelSlot: null,
                specs: { ratedPower: 2200, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0.3 },
            },
        ],
        edges: [
            {
                id: EDGE_ID,
                from: SOURCE_ID,
                to: SOCKET_ID,
                cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu', length: 0 },
                waypointsM: [{ x: 1, y: 2 }, { x: 0.5, y: 0.25 }],
                waypointsPx: [{ x: 100, y: 200 }, { x: 50, y: 25 }],
                edgeType: 'cable_line',
                cableBrand: 'ВВГнг(А)-LS',
            },
        ],
    };
}

describe('persistence', () => {
    it('использует версию схемы 2', () => {
        expect(SUPPORTED_SCHEMA_VERSION).toBe(2);
    });

    it('сериализует v2 и разбирает его без потерь', () => {
        const graph = makeGraph();
        const text = serializeProject(graph);
        const envelope = JSON.parse(text) as Record<string, unknown>;
        expect(envelope['format']).toBe('vwc-project');
        expect(envelope['schemaVersion']).toBe(2);

        const result = parseProject(text);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.graph).toEqual(graph);
        }
    });

    it('мигрирует файл версии 1 с масштабом в версию 2', () => {
        const v1 = {
            ...makeGraph(),
            schemaVersion: 1,
            edges: makeGraph().edges.map((edge) => ({
                id: edge.id,
                from: edge.from,
                to: edge.to,
                cableSpecs: edge.cableSpecs,
                waypointsPx: edge.waypointsPx,
                edgeType: edge.edgeType,
                cableBrand: edge.cableBrand,
            })),
        };
        const text = JSON.stringify({
            format: 'vwc-project',
            schemaVersion: 1,
            graph: v1,
            savedAt: new Date().toISOString(),
        });
        const result = parseProject(text);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.graph.schemaVersion).toBe(2);
            expect(result.graph.edges[0]?.waypointsM).toEqual([{ x: 1, y: 2 }, { x: 0.5, y: 0.25 }]);
        }
    });

    it('загружает v1 без масштаба с масштабом по умолчанию', () => {
        const v1 = { ...makeGraph(), schemaVersion: 1, floorPlan: { ...makeGraph().floorPlan, scaleMetersPerPx: null } };
        const text = JSON.stringify({
            format: 'vwc-project',
            schemaVersion: 1,
            graph: v1,
            savedAt: new Date().toISOString(),
        });
        expect(parseProject(text).ok).toBe(true);
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
        expect(parseProject(JSON.stringify({ format: 'vwc-project', schemaVersion: 3, graph: {} }))).toEqual({
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

    it('отвергает некорректный граф версии 2', () => {
        expect(
            parseProject(
                JSON.stringify({
                    format: 'vwc-project',
                    schemaVersion: 2,
                    graph: {},
                    savedAt: new Date().toISOString(),
                }),
            ),
        ).toEqual({ ok: false, code: 'invalidGraph' });
    });
});
