// © 2026 RuChating (iilmchat) · VoltWireCraft v0.6.0
/** Сборка запроса ВТХ-селективности из графа проекта (RULES § 4.18, 5.1). */

import type {
  ProjectGraph,
  SelectivityTccDevice,
  SelectivityTccRequest,
} from '@voltwirecraft/shared/graph.schema.js';

/** Типы узлов графа, которые являются аппаратами защиты или щитами. */
const PROTECTION_KINDS: ReadonlySet<string> = new Set([
  'panel',
  'circuit_breaker',
  'rcbo',
  'rcd',
  'switch',
  'contactor',
]);
/** Характеристика расцепителя по умолчанию для оборудования каталога. */
const DEFAULT_TRIP_CURVE = 'C';
/** Коммутационная способность по умолчанию, кА. */
const DEFAULT_BREAKING_CAPACITY_KA = 6;
/** Предельная потеря напряжения по ПУЭ-7, %. */
const VOLTAGE_DROP_LIMIT_PERCENT = 5;

/**
 * Формирует запрос к `POST /v1/calc/selectivity-tcc` из канонического графа.
 * Математика не выполняется: ядро получает только параметры аппаратов и потери.
 *
 * @param graph — граф проекта версии 2.
 * @returns запрос, готовый к Zod-валидации на границе вызова.
 */
export function buildSelectivityRequest(graph: ProjectGraph): SelectivityTccRequest {
  const shortCircuitValues = graph.edges
    .map((edge) => edge.cableSpecs.shortCircuitCurrentA ?? 0)
    .filter((value) => value > 0);
  const shortCircuitCurrentA = shortCircuitValues.length === 0 ? undefined : Math.max(...shortCircuitValues);

  const devices: SelectivityTccDevice[] = graph.nodes
    .filter((node) => PROTECTION_KINDS.has(node.kind) && node.specs.ratedCurrent > 0)
    .map((node) => ({
      id: node.id,
      ratedCurrentA: node.specs.ratedCurrent,
      tripCurve: DEFAULT_TRIP_CURVE,
      breakingCapacityKa: DEFAULT_BREAKING_CAPACITY_KA,
      ...(node.parentPanelId === undefined ? {} : { parentId: node.parentPanelId }),
      ...(shortCircuitCurrentA === undefined ? {} : { shortCircuitCurrentA }),
    }));

  const feederDrops = graph.edges.map((edge) => edge.upstreamVoltageDropPercent ?? 0);
  const groupDrops = graph.edges.map((edge) => edge.cableSpecs.voltageDropPercent ?? 0);

  return {
    devices,
    upstreamVoltageDropPercent: feederDrops.length === 0 ? 0 : Math.max(...feederDrops),
    groupVoltageDropPercent: groupDrops.length === 0 ? 0 : Math.max(...groupDrops),
    voltageDropLimitPercent: VOLTAGE_DROP_LIMIT_PERCENT,
  };
}
