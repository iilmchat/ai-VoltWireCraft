import { describe, expect, it } from 'vitest';
import { selectNodeList, useGraphStore } from './graph-store.js';

describe('graph-store', () => {
  it('содержит демонстрационный граф с узлами и связями', () => {
    const state = useGraphStore.getState();

    expect(selectNodeList(state)).toHaveLength(3);
    expect(state.graph.edges).toHaveLength(2);
  });

  it('выбирает узел и сбрасывает выбор при замене графа', () => {
    const store = useGraphStore.getState();
    const firstNode = selectNodeList(store)[0];
    expect(firstNode).toBeDefined();
    if (firstNode === undefined) {
      throw new Error('В графе должен быть хотя бы один узел');
    }

    store.selectNode(firstNode.id);
    expect(useGraphStore.getState().selectedNodeId).toBe(firstNode.id);

    const nextGraph = { ...store.graph, name: 'Новый проект' };
    useGraphStore.getState().setGraph(nextGraph);

    expect(useGraphStore.getState().selectedNodeId).toBeNull();
    expect(useGraphStore.getState().graph.name).toBe('Новый проект');
  });
});
