// © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
/** Тесты канонического графа v2 и детерминированной миграции v1 → v2 (KI-003). */

import { describe, expect, it } from 'vitest';
import {
    CABLE_LINE_EDGE_TYPE,
    CalculateCableLengthRequestSchema,
    createEmptyProjectGraph,
    migrateProjectGraphV1ToV2,
    migrateProjectGraphV1ToV2WithReport,
    parseProjectGraph,
    parseVwcFile,
    ProjectGraphSchema,
    type ProjectGraph,
} from '../src/index.js';

const PANEL_ID = '11111111-1111-4111-8111-111111111111';
const SOCKET_ID = '22222222-2222-4222-8222-222222222222';
const EDGE_ID = '44444444-4444-4444-8444-444444444444';

/** Собирает корректный граф v2 с узлами и кабельной линией. */
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
        waypointsM: [
            { x: 0, y: 0 },
            { x: 3, y: 2 },
        ],
        waypointsPx: [
            { x: 0, y: 0 },
            { x: 300, y: 200 },
        ],
        edgeType: CABLE_LINE_EDGE_TYPE,
        cableBrand: 'ВВГнг(А)-LS',
    });
    return graph;
}

/** Собирает граф версии 1 с пиксельными координатами трассы. */
function makeV1Graph() {
    return {
        schemaVersion: 1 as const,
        id: PANEL_ID,
        name: 'Старый проект',
        floorPlan: {
            background: null,
            scaleMetersPerPx: 0.01,
            ceilingHeightM: 2.7,
        },
        rooms: [],
        walls: [],
        nodes: [
            {
                id: PANEL_ID,
                kind: 'panel',
                label: 'Щит НКУ',
                planPosition: { x: 0, y: 0 },
                panelSlot: null,
                specs: { ratedPower: 0, ratedCurrent: 32, crossSection: 6, mountingHeight: 1.5 },
            },
            {
                id: SOCKET_ID,
                kind: 'socket',
                label: 'Розетка',
                planPosition: { x: 3, y: 2 },
                panelSlot: null,
                specs: { ratedPower: 0, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0.3 },
            },
        ],
        edges: [
            {
                id: EDGE_ID,
                from: PANEL_ID,
                to: SOCKET_ID,
                cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu', length: 3.6 },
                waypointsPx: [
                    { x: 0, y: 0 },
                    { x: 300, y: 200 },
                ],
            },
        ],
    };
}

describe('канонический ProjectGraphSchema v2', () => {
    it('принимает граф с метрическими точками трассы', () => {
        const graph = parseProjectGraph(makeGraph());

        expect(graph.schemaVersion).toBe(2);
        expect(graph.edges[0]?.waypointsM).toEqual([
            { x: 0, y: 0 },
            { x: 3, y: 2 },
        ]);
        expect(graph.edges[0]?.cableBrand).toBe('ВВГнг(А)-LS');
    });

    it('отвергает ребро без waypointsM', () => {
        const graph = makeGraph();
        delete (graph.edges[0] as { waypointsM?: unknown }).waypointsM;

        expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
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
});

describe('миграция v1 → v2 (KI-003)', () => {
    it('пересчитывает waypointsPx в метры и назначает panelSlot', () => {
        const result = migrateProjectGraphV1ToV2WithReport(makeV1Graph());

        expect(result.graph.schemaVersion).toBe(2);
        expect(result.graph.edges[0]?.waypointsM).toEqual([
            { x: 0, y: 0 },
            { x: 3, y: 2 },
        ]);
        expect(result.graph.nodes[0]?.panelSlot).toBe(1);
        expect(result.graph.nodes.every((node) => node.catalogDeviceId === null)).toBe(true);
        expect(result.report.convertedWaypoints).toBe(2);
        expect(result.report.assignedPanelSlots).toBe(1);
        expect(ProjectGraphSchema.safeParse(result.graph).success).toBe(true);
    });

    it('детерминированна', () => {
        expect(migrateProjectGraphV1ToV2(makeV1Graph())).toEqual(
            migrateProjectGraphV1ToV2(makeV1Graph()),
        );
    });

    it('автоматически применяется parseProjectGraph к графу v1', () => {
        expect(parseProjectGraph(makeV1Graph()).schemaVersion).toBe(2);
    });

    it('мигрирует обёртку .vwc v1 без потери данных', () => {
        const file = parseVwcFile({
            format: 'vwc-project',
            schemaVersion: 1,
            graph: makeV1Graph(),
            savedAt: '2026-11-19T12:00:00.000Z',
        });

        expect(file.schemaVersion).toBe(2);
        expect(file.graph.name).toBe('Старый проект');
        expect(file.graph.edges[0]?.cableSpecs.length).toBe(3.6);
        expect(file.graph.edges[0]?.waypointsM).toHaveLength(2);
    });

    it('предупреждает об отсутствии масштаба, не теряя координаты', () => {
        const v1 = makeV1Graph();
        v1.floorPlan.scaleMetersPerPx = null;
        const result = migrateProjectGraphV1ToV2WithReport(v1);

        expect(result.report.warnings).toContain('scaleMetersPerPx is null — координаты переведены с масштабом 1 м/px');
        expect(result.graph.edges[0]?.waypointsM[1]).toEqual({ x: 300, y: 200 });
    });
});

describe('CalculateCableLengthRequestSchema', () => {
    it('допускает отсутствие коэффициента запаса и отвергает нулевой масштаб', () => {
        const valid = {
            waypointsPx: [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
            ],
            scaleMetersPerPx: 0.01,
            ceilingHeightM: 2.7,
            sourceMountHeightM: 0.3,
            targetMountHeightM: 1.5,
        };

        expect(CalculateCableLengthRequestSchema.safeParse(valid).success).toBe(true);
        expect(
            CalculateCableLengthRequestSchema.safeParse({ ...valid, scaleMetersPerPx: 0 }).success,
        ).toBe(false);
    });
});
