// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { describe, expect, it } from 'vitest';
import {
    CalculateCableLengthRequestSchema,
    CreateProjectDtoSchema,
    createEmptyProjectGraph,
    ProjectGraphSchema,
    VwcFileSchema,
} from './graph.schema.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ZONE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NODE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EDGE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function makeGraph() {
    const graph = createEmptyProjectGraph('Тестовый проект', PROJECT_ID);
    graph.floorPlans.push({
        id: PLAN_ID,
        name: '1-й этаж',
        background: null,
        widthPx: 1000,
        heightPx: 800,
        scaleMetersPerPx: 0.01,
        ceilingHeightM: 2.7,
    });
    graph.roomZones.push({
        id: ZONE_ID,
        floorPlanId: PLAN_ID,
        name: 'Гостиная',
        kind: 'living',
        polygonPx: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
        ],
    });
    graph.nodes.push({
        id: NODE_ID,
        floorPlanId: PLAN_ID,
        roomZoneId: ZONE_ID,
        kind: 'socket',
        label: 'Розетка Р1',
        positionPx: { x: 5, y: 5 },
        mountHeightM: 0.3,
        ratedPowerW: null,
    });
    graph.nodes.push({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'.replace('dddd', 'ffff'),
        floorPlanId: PLAN_ID,
        roomZoneId: ZONE_ID,
        kind: 'switch',
        label: 'Выключатель В1',
        positionPx: { x: 8, y: 5 },
        mountHeightM: 1.5,
        ratedPowerW: null,
    });
    graph.edges.push({
        id: EDGE_ID,
        sourceNodeId: NODE_ID,
        targetNodeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'.replace('dddd', 'ffff'),
        kind: 'power',
        waypointsPx: [
            { x: 5, y: 5 },
            { x: 8, y: 5 },
        ],
        crossSectionMm2: 1.5,
    });
    return graph;
}

describe('graph.schema — канонический граф проекта', () => {
    it('пустой граф проходит валидацию', () => {
        expect(ProjectGraphSchema.safeParse(createEmptyProjectGraph()).success).toBe(true);
    });

    it('полный граф со ссылками проходит валидацию', () => {
        expect(ProjectGraphSchema.safeParse(makeGraph()).success).toBe(true);
    });

    it('отвергает ребро со ссылкой на несуществующий узел', () => {
        const graph = makeGraph();
        graph.edges[0]!.targetNodeId = '99999999-9999-4999-8999-999999999999';
        const result = ProjectGraphSchema.safeParse(graph);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.path).toContain('targetNodeId');
        }
    });

    it('отвергает узел с несуществующим планом этажа', () => {
        const graph = makeGraph();
        graph.nodes[0]!.floorPlanId = '99999999-9999-4999-8999-999999999999';

        expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
    });

    it('отвергает дублирующиеся идентификаторы', () => {
        const graph = makeGraph();
        graph.nodes[1]!.id = NODE_ID;

        expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
    });
});

describe('graph.schema — API-контракты', () => {
    it('принимает корректный DTO создания проекта', () => {
        const result = CreateProjectDtoSchema.safeParse({
            title: 'Дом ИЖС',
            objectType: 'house',
            networkSystem: 'tn-s',
        });

        expect(result.success).toBe(true);
    });

    it('отвергает неизвестную систему заземления', () => {
        expect(
            CreateProjectDtoSchema.safeParse({
                title: 'Дом',
                objectType: 'house',
                networkSystem: 'tn-s-nonsense',
            }).success,
        ).toBe(false);
    });

    it('запрос расчёта допускает отсутствие коэффициента запаса', () => {
        const result = CalculateCableLengthRequestSchema.safeParse({
            waypointsPx: [{ x: 0, y: 0 }],
            scaleMetersPerPx: 0.01,
            ceilingHeightM: 2.7,
            sourceMountHeightM: 0.3,
            targetMountHeightM: 1.5,
        });

        expect(result.success).toBe(true);
    });
});

describe('graph.schema — файл .vwc', () => {
    it('принимает обёртку над пустым графом', () => {
        const result = VwcFileSchema.safeParse({
            format: 'vwc-project',
            schemaVersion: 1,
            graph: createEmptyProjectGraph(),
            savedAt: '2026-11-19T12:00:00.000Z',
        });

        expect(result.success).toBe(true);
    });
});
