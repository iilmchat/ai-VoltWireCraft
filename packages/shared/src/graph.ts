import { z } from 'zod';

/** Вид узла графа проекта (электроустановочное изделие или устройство). */
export const NodeKindSchema = z.enum([
  'source',
  'panel',
  'outlet',
  'switch',
  'light',
  'junction',
  'load',
]);

/** Тип узла графа проекта. */
export type NodeKind = z.infer<typeof NodeKindSchema>;

/**
 * Точка в пространстве в базовых единицах СИ (метры).
 * Координаты `x`, `y` задают положение на плане, `z` — высоту.
 */
export const Point3DSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite().default(0),
});

/** Точка в пространстве в метрах. */
export type Point3D = z.infer<typeof Point3DSchema>;

/** Узел графа проекта: ЭУИ, щит НКУ, источник или нагрузка. */
export const GraphNodeSchema = z.object({
  id: z.uuid(),
  kind: NodeKindSchema,
  label: z.string().min(1).max(128),
  position: Point3DSchema,
  /** Номинальная мощность, Вт (СИ). */
  ratedPower: z.number().nonnegative().optional(),
  /** Дополнительные атрибуты узла, не влияющие на геометрию. */
  meta: z.record(z.string(), z.unknown()).default({}),
});

/** Узел графа проекта. */
export type GraphNode = z.infer<typeof GraphNodeSchema>;

/** Параметры кабеля линии графа. */
export const CableSchema = z.object({
  /** Сечение токопроводящей жилы, мм² (СИ). */
  crossSection: z.number().positive(),
  /** Число жил. */
  conductorCount: z.number().int().positive().default(3),
  /** Материал жилы: медь или алюминий. */
  material: z.enum(['cu', 'al']).default('cu'),
});

/** Параметры кабеля линии графа. */
export type Cable = z.infer<typeof CableSchema>;

/** Ребро графа: кабельная линия между узлами. */
export const GraphEdgeSchema = z.object({
  id: z.uuid(),
  from: z.uuid(),
  to: z.uuid(),
  cable: CableSchema,
  /** Длина трассы, м (СИ); вычисляется расчётным ядром. */
  length: z.number().nonnegative().default(0),
});

/** Ребро графа проекта. */
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

/**
 * Граф проекта — единый источник истины для плана этажа и однолинейной схемы
 * (RULES § 5.2). Все физические величины — в базовых единицах СИ (RULES § 5.3).
 */
export const ProjectGraphSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive().default(1),
    name: z.string().min(1).max(200),
    nodes: z.array(GraphNodeSchema).min(1),
    edges: z.array(GraphEdgeSchema).default([]),
  })
  .superRefine((graph, ctx) => {
    const seen = new Set<string>();
    for (const [index, node] of graph.nodes.entries()) {
      if (seen.has(node.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', index, 'id'],
          message: 'Идентификатор узла графа должен быть уникальным',
        });
      }
      seen.add(node.id);
    }

    for (const [index, edge] of graph.edges.entries()) {
      if (!seen.has(edge.from)) {
        ctx.addIssue({
          code: 'custom',
          path: ['edges', index, 'from'],
          message: 'Ребро ссылается на несуществующий узел from',
        });
      }
      if (!seen.has(edge.to)) {
        ctx.addIssue({
          code: 'custom',
          path: ['edges', index, 'to'],
          message: 'Ребро ссылается на несуществующий узел to',
        });
      }
    }
  });

/** Тип графа проекта, выведенный из `ProjectGraphSchema`. */
export type ProjectGraph = z.infer<typeof ProjectGraphSchema>;
