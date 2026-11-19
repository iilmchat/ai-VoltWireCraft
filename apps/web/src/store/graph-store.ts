import type { BackendProjectGraph as ProjectGraph, GraphNode } from '@voltwirecraft/shared';
import { create } from 'zustand';

/** Демонстрационный граф: источник истины для обеих проекций (RULES § 5.2). */
const DEMO_GRAPH: ProjectGraph = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  version: 1,
  name: 'Демо-проект ИЖС',
  nodes: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'panel',
      label: 'ВРУ-1',
      position: { x: 1, y: 1, z: 1.4 },
      ratedPower: 9500,
      meta: {},
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'outlet',
      label: 'Розетка Р1',
      position: { x: 4, y: 2, z: 0.3 },
      meta: {},
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'light',
      label: 'Светильник С1',
      position: { x: 6, y: 3, z: 2.6 },
      meta: {},
    },
  ],
  edges: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      from: '11111111-1111-4111-8111-111111111111',
      to: '22222222-2222-4222-8222-222222222222',
      cable: { crossSection: 3, conductorCount: 3, material: 'cu' },
      length: 0,
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      from: '11111111-1111-4111-8111-111111111111',
      to: '33333333-3333-4333-8333-333333333333',
      cable: { crossSection: 1.5, conductorCount: 3, material: 'cu' },
      length: 0,
    },
  ],
};

/** Состояние редактора графа проекта. */
export interface GraphState {
  /** Активный граф проекта. */
  readonly graph: ProjectGraph;
  /** Идентификатор выбранного узла или `null`. */
  readonly selectedNodeId: string | null;
  /** Заменяет граф проекта. */
  readonly setGraph: (graph: ProjectGraph) => void;
  /** Выбирает узел по идентификатору. */
  readonly selectNode: (id: string | null) => void;
}

/** Zustand-хранилище графа проекта. */
export const useGraphStore = create<GraphState>((set) => ({
  graph: DEMO_GRAPH,
  selectedNodeId: null,
  setGraph: (graph) => set({ graph, selectedNodeId: null }),
  selectNode: (id) => set({ selectedNodeId: id }),
}));

/**
 * Селектор узлов графа.
 *
 * @param state — состояние хранилища.
 * @returns список узлов в порядке графа.
 */
export function selectNodeList(state: GraphState): readonly GraphNode[] {
  return state.graph.nodes;
}
