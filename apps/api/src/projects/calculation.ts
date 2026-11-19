// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Преобразование графа проекта в запросы расчётного ядра и DTO результата. */

import { z } from 'zod';
import type {
  CalculateCableLengthRequest,
  GraphEdge,
  ProjectGraph,
} from '@voltwirecraft/shared/graph.schema.js';

/** Результат расчёта одной кабельной линии. */
export const CalculationEdgeSchema = z.object({
  /** Идентификатор ребра графа. */
  edgeId: z.uuid(),
  /** Успешность расчёта линии. */
  status: z.enum(['ok', 'error']),
  /** Длина линии, м; присутствует только при успешном расчёте. */
  lengthM: z.number().nonnegative().optional(),
  /** Описание ошибки; присутствует только при неудачном расчёте. */
  error: z.string().optional(),
});
/** Тип результата расчёта линии. */
export type CalculationEdge = z.infer<typeof CalculationEdgeSchema>;

/** Ответ `POST /projects/:id/calculate`. */
export const ProjectCalculationDtoSchema = z.object({
  /** Идентификатор проекта. */
  projectId: z.uuid(),
  /** Суммарная длина успешно рассчитанных линий, м. */
  totalLengthM: z.number().nonnegative(),
  /** Результаты по каждой линии графа. */
  edges: z.array(CalculationEdgeSchema),
});
/** Тип ответа расчёта проекта. */
export type ProjectCalculationDto = z.infer<typeof ProjectCalculationDtoSchema>;

/** Запас длины на укладку по умолчанию (доля). */
const DEFAULT_RESERVE_FACTOR = 1.15;

/**
 * Строит запрос к calc-engine для одного ребра графа.
 * Геометрия берётся из графа (RULES § 4.18), перевод единиц — на границе вызова.
 *
 * @param graph — граф проекта.
 * @param edge — кабельная линия.
 * @returns запрос расчёта длины.
 * @throws {Error} если у линии нет координат или масштаб не откалиброван.
 */
export function buildCableRequest(
  graph: ProjectGraph,
  edge: GraphEdge,
): CalculateCableLengthRequest {
  const from = graph.nodes.find((node) => node.id === edge.from);
  const to = graph.nodes.find((node) => node.id === edge.to);
  if (from === undefined || to === undefined) {
    throw new Error('Линия ссылается на несуществующий узел графа');
  }

  const scale = graph.floorPlan.scaleMetersPerPx;
  const waypoints = edge.waypointsPx;
  let waypointsPx: readonly { x: number; y: number }[];
  let scaleMetersPerPx = 1;

  if (waypoints !== undefined && waypoints.length >= 2 && scale !== null) {
    waypointsPx = waypoints;
    scaleMetersPerPx = scale;
  } else {
    waypointsPx = [from.planPosition, to.planPosition].filter(
      (point): point is NonNullable<typeof point> => point !== null,
    );
  }

  if (waypointsPx.length < 2) {
    throw new Error('Для расчёта линии необходимы две точки с координатами');
  }

  return {
    waypointsPx: [...waypointsPx],
    // Если координаты узлов уже в метрах, масштаб единичный (RULES § 5.3).
    scaleMetersPerPx,
    ceilingHeightM: graph.floorPlan.ceilingHeightM,
    sourceMountHeightM: from.specs.mountingHeight,
    targetMountHeightM: to.specs.mountingHeight,
    reserveFactor: DEFAULT_RESERVE_FACTOR,
  };
}
