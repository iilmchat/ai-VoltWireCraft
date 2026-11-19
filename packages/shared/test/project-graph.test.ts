// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { describe, expect, it } from 'vitest';
import {
    CABLE_LINE_EDGE_TYPE,
    CalculateCableLengthRequestSchema,
    createEmptyProjectGraph,
    parseProjectGraph,
    ProjectGraphSchema,
    type ProjectGraph,
} from '../src/index.js';

const PANEL_ID = '11111111-1111-4111-8111-111111111111';
const SOCKET_ID = '22222222-2222-4222-8222-222222222222';
const EDGE_ID = '44444444-4444-4444-8444-444444444444';

/** Собирает корректный канонический граф с узлами и кабельной линией. */
function makeGraph(): ProjectGraph {
    const graph = createEmptyProjectGraph('Тестовый проект');
    graph.nodes.push(
        {
            id: PANEL_ID,
            kind: 'panel',
            label: 'Щит НКУ',
            planPosition: { x: 0, y: 0 },
            panelSlot: 1,
            specs: { ratedPower: 0, ratedCurrent: 32, crossSection: 6, mountingHeight: 1.5 },
            roomId: null,
        },
        {
            id: SOCKET_ID,
            kind: 'socket',
            label: 'Розетка',
            planPosition: { x: 3, y: 2 },
            panelSlot: null,
            specs: { ratedPower: 0, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0.3 },
            roomId: null,
        },
    );
    graph.edges.push({
        id: EDGE_ID,
        from: PANEL_ID,
        to: SOCKET_ID,
        cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu', length: 3.6 },
        waypointsPx: [
            { x: 0, y: 0 },
            { x: 3, y: 2 },
        ],
        edgeType: CABLE_LINE_EDGE_TYPE,
        cableBrand: 'ВВГнг(А)-LS',
    });
    return graph;
}

describe('канонический ProjectGraphSchema', () => {
    it('parseProjectGraph принимает граф и сохраняет метаданные линии', () => {
        const graph = parseProjectGraph(makeGraph());

        expect(graph.nodes).toHaveLength(2);
        expect(graph.nodes[0]?.kind).toBe('panel');
        const edge = graph.edges[0];
        expect(edge?.edgeType).toBe('cable_line');
        expect(edge?.cableBrand).toBe('ВВГнг(А)-LS');
        expect(edge?.waypointsPx).toEqual([
            { x: 0, y: 0 },
            { x: 3, y: 2 },
        ]);
        expect(edge?.cableSpecs.conductorCount).toBe(3);
    });

    it('отвергает ребро со ссылкой на несуществующий узел', () => {
        const graph = makeGraph();
        graph.edges[0]!.to = '99999999-9999-4999-8999-999999999999';

        const result = ProjectGraphSchema.safeParse(graph);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((issue) => issue.path.includes('to'))).toBe(true);
        }
    });

    it('отвергает дублирующиеся идентификаторы узлов', () => {
        const graph = makeGraph();
        graph.nodes[1]!.id = PANEL_ID;

        expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
    });

    it('отвергает неположительный масштаб плана этажа', () => {
        const graph = makeGraph();
        graph.floorPlan.scaleMetersPerPx = 0;

        expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
    });
});

describe('CalculateCableLengthRequestSchema', () => {
    it('допускает отсутствие коэффициента запаса и отвергает нулевой масштаб', () => {
        const valid = {
            waypointsPx: [
                { x: 0, y: 0 },
                { x: 3, y: 2 },
            ],
            scaleMetersPerPx: 0.001,
            ceilingHeightM: 2.7,
            sourceMountHeightM: 1.5,
            targetMountHeightM: 0.3,
        };

        expect(CalculateCableLengthRequestSchema.safeParse(valid).success).toBe(true);
        expect(
            CalculateCableLengthRequestSchema.safeParse({ ...valid, scaleMetersPerPx: 0 }).success,
        ).toBe(false);
    });
});
