// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Тесты каталога и преобразования графа в запрос расчётного ядра. */

import { describe, expect, it } from 'vitest';
import { createEmptyProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import type { ProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import { CATALOG_SEED_ROWS } from '../src/database/catalog-seed-data.js';
import { buildCableRequest } from '../src/projects/calculation.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NODE_A = '11111111-1111-4111-8111-111111111111';
const NODE_B = '22222222-2222-4222-8222-222222222222';
const EDGE_ID = '33333333-3333-4333-8333-333333333333';

function makeGraph(): ProjectGraph {
  const graph = createEmptyProjectGraph('Тестовый проект', PROJECT_ID);
  graph.nodes.push(
    {
      id: NODE_A,
      kind: 'input_source',
      label: 'ВРУ',
      planPosition: { x: 0, y: 0 },
      panelSlot: null,
      specs: { ratedPower: 0, ratedCurrent: 63, crossSection: 16, mountingHeight: 1.5 },
      roomId: null,
    },
    {
      id: NODE_B,
      kind: 'socket',
      label: 'Розетка',
      planPosition: { x: 3, y: 4 },
      panelSlot: null,
      specs: { ratedPower: 100, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0.3 },
      roomId: null,
    },
  );
  graph.edges.push({
    id: EDGE_ID,
    from: NODE_A,
    to: NODE_B,
    cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu', length: 0 },
  });
  return graph;
}

describe('catalog seed', () => {
  it('содержит 40 уникальных позиций с заполненными ценами', () => {
    expect(CATALOG_SEED_ROWS).toHaveLength(40);
    expect(new Set(CATALOG_SEED_ROWS.map((row) => row.sku)).size).toBe(40);
    expect(CATALOG_SEED_ROWS.every((row) => row.priceRub.length > 0)).toBe(true);
  });

  it('покрывает автоматы, УЗО, АВДТ, реле напряжения и корпуса щитов', () => {
    const types = new Set(CATALOG_SEED_ROWS.map((row) => row.deviceType));
    expect(types).toEqual(
      new Set(['circuit_breaker', 'rcd', 'rcbo', 'relay_voltage', 'contactor', 'panel']),
    );
    expect(CATALOG_SEED_ROWS.filter((row) => row.deviceType === 'panel')).toHaveLength(4);
  });
});

describe('buildCableRequest', () => {
  it('использует координаты узлов в метрах при отсутствии калибровки', () => {
    const graph = makeGraph();
    const request = buildCableRequest(graph, graph.edges[0]!);

    expect(request.waypointsPx).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ]);
    expect(request.scaleMetersPerPx).toBe(1);
    expect(request.sourceMountHeightM).toBe(1.5);
    expect(request.targetMountHeightM).toBe(0.3);
    expect(request.reserveFactor).toBe(1.15);
  });

  it('использует waypointsPx и масштаб плана, когда они доступны', () => {
    const graph = makeGraph();
    graph.floorPlan.scaleMetersPerPx = 0.01;
    graph.edges[0]!.waypointsPx = [
      { x: 0, y: 0 },
      { x: 300, y: 400 },
    ];

    const request = buildCableRequest(graph, graph.edges[0]!);

    expect(request.scaleMetersPerPx).toBe(0.01);
    expect(request.waypointsPx).toHaveLength(2);
  });

  it('сообщает об ошибке, если у линии нет координат', () => {
    const graph = makeGraph();
    graph.nodes[0]!.planPosition = null;

    expect(() => buildCableRequest(graph, graph.edges[0]!)).toThrow(/координат/);
  });
});
