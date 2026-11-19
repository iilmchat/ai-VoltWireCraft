// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { createEmptyProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import type { GraphNode, ProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import { create } from 'zustand';

/**
 * Демонстрационный канонический граф: источник истины для плана и схемы.
 * @returns Валидный граф с узлами щита и розетки.
 */
function createDemoGraph(): ProjectGraph {
    const graph = createEmptyProjectGraph('Демо-проект ИЖС', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    return {
        ...graph,
        floorPlan: {
            background: null,
            scaleMetersPerPx: 0.01,
            ceilingHeightM: 2.7,
        },
        nodes: [
            {
                id: '11111111-1111-4111-8111-111111111111',
                kind: 'panel',
                label: 'ВРУ-1',
                planPosition: { x: 1, y: 1 },
                panelSlot: null,
                roomId: null,
                specs: { ratedPower: 9500, ratedCurrent: 63, crossSection: 10, mountingHeight: 1.4 },
            },
            {
                id: '22222222-2222-4222-8222-222222222222',
                kind: 'socket',
                label: 'Розетка Р1',
                planPosition: { x: 4, y: 2 },
                panelSlot: null,
                roomId: null,
                specs: { ratedPower: 0, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0.3 },
            },
            {
                id: '33333333-3333-4333-8333-333333333333',
                kind: 'light_fixture',
                label: 'Светильник С1',
                planPosition: { x: 6, y: 3 },
                panelSlot: null,
                roomId: null,
                specs: { ratedPower: 60, ratedCurrent: 6, crossSection: 1.5, mountingHeight: 2.6 },
            },
        ],
        edges: [
            {
                id: '44444444-4444-4444-8444-444444444444',
                from: '11111111-1111-4111-8111-111111111111',
                to: '22222222-2222-4222-8222-222222222222',
                cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu', length: 0 },
                edgeType: 'cable_line',
                cableBrand: 'ВВГнг(А)-LS',
                waypointsPx: [{ x: 100, y: 100 }, { x: 400, y: 200 }],
                waypointsM: [{ x: 1, y: 1 }, { x: 4, y: 2 }],
            },
            {
                id: '55555555-5555-4555-8555-555555555555',
                from: '11111111-1111-4111-8111-111111111111',
                to: '33333333-3333-4333-8333-333333333333',
                cableSpecs: { crossSection: 1.5, conductorCount: 3, material: 'cu', length: 0 },
                edgeType: 'cable_line',
                cableBrand: 'ВВГнг(А)-LS',
                waypointsPx: [{ x: 100, y: 100 }, { x: 600, y: 300 }],
                waypointsM: [{ x: 1, y: 1 }, { x: 6, y: 3 }],
            },
        ],
    };
}

/** Состояние демонстрационного графа. */
export interface GraphState {
    /** Активный граф проекта. */
    readonly graph: ProjectGraph;
    /** Идентификатор выбранного узла. */
    readonly selectedNodeId: string | null;
    /** Заменяет граф проекта. */
    readonly setGraph: (graph: ProjectGraph) => void;
    /** Выбирает узел по идентификатору. */
    readonly selectNode: (id: string | null) => void;
}

/** Zustand-хранилище графа проекта. */
export const useGraphStore = create<GraphState>((set) => ({
    graph: createDemoGraph(),
    selectedNodeId: null,
    setGraph: (graph) => set({ graph, selectedNodeId: null }),
    selectNode: (id) => set({ selectedNodeId: id }),
}));

/**
 * Селектор узлов графа.
 * @param state Состояние хранилища.
 * @returns Список узлов в порядке графа.
 */
export function selectNodeList(state: GraphState): readonly GraphNode[] {
    return state.graph.nodes;
}
