import { describe, expect, it } from 'vitest';
import { CableLengthRequestSchema, ProjectGraphSchema, parseProjectGraph } from '../src/index.js';

const NODE_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
] as const;

function makeGraph() {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Тестовый проект',
    nodes: [
      {
        id: NODE_IDS[0],
        kind: 'panel',
        label: 'Щит НКУ',
        position: { x: 0, y: 0, z: 1.5 },
      },
      {
        id: NODE_IDS[1],
        kind: 'outlet',
        label: 'Розетка',
        position: { x: 3, y: 2, z: 0.3 },
      },
    ],
    edges: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        from: NODE_IDS[0],
        to: NODE_IDS[1],
        cable: { crossSection: 2.5 },
      },
    ],
  };
}

describe('ProjectGraphSchema', () => {
  it('принимает корректный граф и подставляет значения по умолчанию', () => {
    const graph = parseProjectGraph(makeGraph());

    expect(graph.version).toBe(1);
    expect(graph.nodes[0]?.position.z).toBe(1.5);
    expect(graph.edges[0]?.cable.material).toBe('cu');
  });

  it('отвергает ребро со ссылкой на несуществующий узел', () => {
    const graph = makeGraph();
    graph.edges[0]!.to = '99999999-9999-4999-8999-999999999999';

    const result = ProjectGraphSchema.safeParse(graph);

    expect(result.success).toBe(false);
  });

  it('отвергает дублирующиеся идентификаторы узлов', () => {
    const graph = makeGraph();
    graph.nodes[1]!.id = NODE_IDS[0];

    expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
  });
});

describe('CableLengthRequestSchema', () => {
  it('требует согласованного числа высот опусков', () => {
    const base = {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      scale: 0.01,
      drops: [0.3],
    };

    expect(CableLengthRequestSchema.safeParse(base).success).toBe(false);
    expect(CableLengthRequestSchema.safeParse({ ...base, drops: [0.3, 0.3] }).success).toBe(true);
  });
});
