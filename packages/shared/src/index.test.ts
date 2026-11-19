// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
    CABLE_LINE_EDGE_TYPE,
    createEmptyProjectGraph,
    GraphNodeSchema,
    metersToPixels,
    parseProjectGraph,
    pixelsToMeters,
    ProjectGraphSchema,
    RoomZoneTypeSchema,
    UuidSchema,
    VwcFileSchema,
} from './index.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NODE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Собирает корректный канонический граф с одним узлом. */
function makeGraph() {
    const graph = createEmptyProjectGraph('Тестовый проект', PROJECT_ID);
    graph.nodes.push(
        GraphNodeSchema.parse({
            id: NODE_ID,
            kind: 'socket',
            label: 'Розетка Р1',
            planPosition: { x: 1, y: 2 },
            panelSlot: null,
            specs: { ratedPower: 0, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0.3 },
        }),
    );
    return graph;
}

describe('каноническая модель графа (реэкспорт из index)', () => {
    it('createEmptyProjectGraph возвращает граф, проходящий ProjectGraphSchema', () => {
        const graph = createEmptyProjectGraph();
        expect(ProjectGraphSchema.safeParse(graph).success).toBe(true);
        expect(graph.nodes).toEqual([]);
        expect(graph.floorPlan.ceilingHeightM).toBeGreaterThan(0);
    });

    it('VwcFile проходит валидацию обёртки .vwc', () => {
        const file: z.input<typeof VwcFileSchema> = {
            format: 'vwc-project',
            schemaVersion: 1,
            graph: createEmptyProjectGraph(),
            savedAt: new Date('2026-11-19T12:00:00.000Z').toISOString(),
        };
        expect(VwcFileSchema.safeParse(file).success).toBe(true);
    });

    it('граф отклоняет неположительный масштаб плана', () => {
        const graph = makeGraph();
        graph.floorPlan.scaleMetersPerPx = 0;
        expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
    });

    it('граф отклоняет неизвестный тип зоны помещения', () => {
        const graph = makeGraph();
        const badRoom = {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            name: 'Кухня',
            type: 'unknown',
            polygon: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 0, y: 1 },
            ],
        };
        expect(ProjectGraphSchema.safeParse({ ...graph, rooms: [badRoom] }).success).toBe(false);
        expect(RoomZoneTypeSchema.safeParse('unknown').success).toBe(false);
    });

    it('опциональные поля кабельной линии сохраняются при разборе', () => {
        const graph = makeGraph();
        graph.edges.push({
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            from: NODE_ID,
            to: NODE_ID,
            cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu', length: 0 },
            waypointsPx: [{ x: 1, y: 2 }],
            edgeType: CABLE_LINE_EDGE_TYPE,
            cableBrand: 'ВВГнг(А)-LS',
        });

        const parsed = parseProjectGraph(graph);
        expect(parsed.edges[0]?.edgeType).toBe('cable_line');
        expect(parsed.edges[0]?.cableBrand).toBe('ВВГнг(А)-LS');
        expect(parsed.edges[0]?.waypointsPx).toEqual([{ x: 1, y: 2 }]);
    });

    it('узел с привязкой к зоне помещения проходит валидацию', () => {
        const graph = makeGraph();
        graph.nodes[0]!.roomId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
        const parsed = parseProjectGraph(graph);
        expect(parsed.nodes[0]?.roomId).toBe('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    });

    it('UuidSchema отклоняет строку, не являющуюся UUID', () => {
        expect(UuidSchema.safeParse('не-uuid').success).toBe(false);
    });
});

describe('преобразование единиц измерения', () => {
    it('метры переводятся в пиксели и обратно', () => {
        const point = { x: 2, y: 3 };
        const pixels = metersToPixels(point, 0.5);
        expect(pixels).toEqual({ x: 4, y: 6 });
        expect(pixelsToMeters(pixels, 0.5)).toEqual(point);
    });
});
