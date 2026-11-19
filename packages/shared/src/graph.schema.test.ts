// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { describe, expect, it } from 'vitest';
import {
    CalculateCableLengthRequestSchema,
    CreateProjectDtoSchema,
    createEmptyProjectGraph,
    GraphNodeSchema,
    NodeKindSchema,
    ProjectGraphSchema,
    UpdateProjectGraphDtoSchema,
    VwcFileSchema,
} from './graph.schema.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NODE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Собирает граф с одним узлом. */
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

describe('graph.schema — канонический граф проекта', () => {
    it('пустой граф проходит валидацию', () => {
        expect(ProjectGraphSchema.safeParse(createEmptyProjectGraph()).success).toBe(true);
    });

    it('граф с узлом проходит валидацию', () => {
        expect(ProjectGraphSchema.safeParse(makeGraph()).success).toBe(true);
    });

    it('NodeKindSchema задаёт ровно 11 типов УГО', () => {
        expect(NodeKindSchema.options).toEqual([
            'input_source',
            'panel',
            'circuit_breaker',
            'rcd',
            'rcbo',
            'relay_voltage',
            'contactor',
            'socket',
            'light_fixture',
            'switch',
            'appliance',
        ]);
    });

    it('отвергает узел с нулевой спецификацией', () => {
        const graph = makeGraph();
        graph.nodes[0]!.specs.ratedCurrent = 0;

        expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
    });
});

describe('graph.schema — API-контракты', () => {
    it('принимает корректный DTO создания проекта', () => {
        expect(
            CreateProjectDtoSchema.safeParse({
                title: 'Дом ИЖС',
                objectType: 'house',
                networkSystem: 'tn-s',
            }).success,
        ).toBe(true);
    });

    it('отвергает неизвестную систему заземления', () => {
        expect(
            CreateProjectDtoSchema.safeParse({
                title: 'Дом',
                objectType: 'house',
                networkSystem: 'unknown',
            }).success,
        ).toBe(false);
    });

    it('принимает DTO обновления с каноническим графом', () => {
        expect(UpdateProjectGraphDtoSchema.safeParse({ graph: makeGraph() }).success).toBe(true);
    });

    it('запрос расчёта допускает отсутствие коэффициента запаса', () => {
        expect(
            CalculateCableLengthRequestSchema.safeParse({
                waypointsPx: [{ x: 0, y: 0 }],
                scaleMetersPerPx: 0.01,
                ceilingHeightM: 2.7,
                sourceMountHeightM: 0.3,
                targetMountHeightM: 1.5,
            }).success,
        ).toBe(true);
    });
});

describe('graph.schema — файл .vwc', () => {
    it('принимает обёртку над пустым графом', () => {
        expect(
            VwcFileSchema.safeParse({
                format: 'vwc-project',
                schemaVersion: 1,
                graph: createEmptyProjectGraph(),
                savedAt: '2026-11-19T12:00:00.000Z',
            }).success,
        ).toBe(true);
    });
});
