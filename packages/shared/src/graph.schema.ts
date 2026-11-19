// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/**
 * Единственная каноническая модель проекта: граф, файл `.vwc` и API-контракты.
 *
 * Основа — `docs/development/v0.1/DESIGN_V010_CORE_AND_PLANNER.md` § 3.1.
 * Граф — источник истины для плана, схемы, БД и файла (RULES § 5.2);
 * физические величины хранятся в базовых единицах СИ (RULES § 5.3).
 */

import { z } from 'zod';

/** Идентификатор сущности графа — UUID (RULES § 4.11). */
export const UuidSchema = z.uuid();
/** Тип идентификатора сущности графа. */
export type Uuid = z.infer<typeof UuidSchema>;

/** Точка на плане; координаты в метрах (СИ). */
export const PointSchema = z.object({
    /** Координата X, m. */
    x: z.number().finite(),
    /** Координата Y, m. */
    y: z.number().finite(),
});
/** Точка на плане. */
export type Point = z.infer<typeof PointSchema>;

/** Базовый набор УГО узлов графа: 11 типов, утверждён в DESIGN § 8. */
export const NodeKindSchema = z.enum([
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
/** Тип узла графа (УГО). */
export type NodeKind = z.infer<typeof NodeKindSchema>;

/** Формат подложки плана этажа. */
export const BackgroundKindSchema = z.enum(['pdf', 'png', 'jpg']);
/** Формат подложки. */
export type BackgroundKind = z.infer<typeof BackgroundKindSchema>;

/** Подложка: отрендеренная страница PDF или растр PNG/JPG. */
export const BackgroundSchema = z.object({
    /** Формат файла. */
    kind: BackgroundKindSchema,
    /** Имя файла. */
    name: z.string().min(1),
    /** Номер страницы PDF; `null` для растровых форматов. */
    pageNumber: z.number().int().positive().nullable(),
    /** Ширина растра, px. */
    widthPx: z.number().positive(),
    /** Высота растра, px. */
    heightPx: z.number().positive(),
    /** Data URL растра для клиента. */
    dataUrl: z.string().min(1),
});
/** Подложка плана этажа. */
export type Background = z.infer<typeof BackgroundSchema>;

/**
 * Параметры плана этажа: подложка, масштаб и высота потолка.
 * `scaleMetersPerPx = null`, если масштаб ещё не откалиброван.
 */
export const FloorPlanSchema = z.object({
    /** Подложка или `null`. */
    background: BackgroundSchema.nullable(),
    /** Масштаб: m/px. */
    scaleMetersPerPx: z.number().positive().nullable(),
    /** Высота потолка, m. */
    ceilingHeightM: z.number().positive(),
});
/** Параметры плана этажа. */
export type FloorPlan = z.infer<typeof FloorPlanSchema>;

/** Тип зоны помещения. */
export const RoomZoneTypeSchema = z.enum(['living', 'wet', 'kitchen', 'outdoor', 'utility']);
/** Тип зоны помещения. */
export type RoomZoneType = z.infer<typeof RoomZoneTypeSchema>;

/** Зона помещения: вершины многоугольника в метрах (СИ). */
export const RoomZoneSchema = z.object({
    /** Идентификатор зоны. */
    id: UuidSchema,
    /** Название помещения. */
    name: z.string().min(1),
    /** Тип помещения. */
    type: RoomZoneTypeSchema,
    /** Вершины полигона, m (не менее трёх). */
    polygon: z.array(PointSchema).min(3),
});
/** Зона помещения. */
export type RoomZone = z.infer<typeof RoomZoneSchema>;

/** Стена, перегородка или проём; координаты в метрах (СИ). */
export const WallSchema = z.object({
    /** Идентификатор стены. */
    id: UuidSchema,
    /** Вид конструктива. */
    kind: z.enum(['wall', 'partition', 'doorway', 'window']),
    /** Точки линии стены, m (не менее двух). */
    path: z.array(PointSchema).min(2),
    /** Толщина, m. */
    thickness: z.number().nonnegative(),
});
/** Стена или проём. */
export type Wall = z.infer<typeof WallSchema>;

/** Спецификация узла графа (электротехнические параметры в СИ). */
export const NodeSpecsSchema = z.object({
    /** Номинальная мощность, W. */
    ratedPower: z.number().nonnegative(),
    /** Номинальный ток, A. */
    ratedCurrent: z.number().positive(),
    /** Сечение жилы, mm2. */
    crossSection: z.number().positive(),
    /** Высота установки от пола, m. */
    mountingHeight: z.number().nonnegative(),
});
/** Спецификация узла. */
export type NodeSpecs = z.infer<typeof NodeSpecsSchema>;

/** Узел графа: УГО, положение на плане, место в щите и спецификация. */
export const GraphNodeSchema = z.object({
    /** Идентификатор узла. */
    id: UuidSchema,
    /** Тип УГО. */
    kind: NodeKindSchema,
    /** Подпись узла. */
    label: z.string().min(1),
    /** Положение на плане, m; `null` — узел только на схеме. */
    planPosition: PointSchema.nullable(),
    /** Место в щите НКУ; `null`, если узел вне щита. */
    panelSlot: z.number().int().positive().nullable(),
    /** Электротехнические параметры. */
    specs: NodeSpecsSchema,
    /** Зона помещения, к которой привязан узел (для инспектора). */
    roomId: UuidSchema.nullable().optional(),
});
/** Узел графа проекта. */
export type GraphNode = z.infer<typeof GraphNodeSchema>;

/** Параметры кабеля линии. */
export const CableSpecsSchema = z.object({
    /** Сечение жилы, mm2. */
    crossSection: z.number().positive(),
    /** Число жил. */
    conductorCount: z.number().int().positive(),
    /** Материал жилы. */
    material: z.enum(['cu', 'al']),
    /** Длина линии, m; вычисляется расчётным ядром. */
    length: z.number().nonnegative(),
});
/** Параметры кабеля. */
export type CableSpecs = z.infer<typeof CableSpecsSchema>;

/** Тип линии графа: кабельная трасса. */
export const CABLE_LINE_EDGE_TYPE = 'cable_line' as const;

/** Ребро графа: кабельная линия между узлами. */
export const GraphEdgeSchema = z.object({
    /** Идентификатор линии. */
    id: UuidSchema,
    /** Исходный узел. */
    from: UuidSchema,
    /** Конечный узел. */
    to: UuidSchema,
    /** Параметры кабеля. */
    cableSpecs: CableSpecsSchema,
    /** Точки трассы в координатах подложки, px. */
    waypointsPx: z.array(PointSchema).optional(),
    /** Тип линии; для кабельных трасс — `'cable_line'`. */
    edgeType: z.literal('cable_line').optional(),
    /** Марка кабеля, например «ВВГнг(А)-LS». */
    cableBrand: z.string().min(1).optional(),
});
/** Ребро графа проекта. */
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

/**
 * Граф проекта — единый источник истины (RULES § 5.2).
 * Дополнительно проверяются уникальность идентификаторов и ссылки линий на узлы.
 */
export const ProjectGraphSchema = z
    .object({
        /** Версия формата. */
        schemaVersion: z.literal(1),
        /** Идентификатор проекта. */
        id: UuidSchema,
        /** Название проекта. */
        name: z.string().min(1),
        /** Параметры плана этажа. */
        floorPlan: FloorPlanSchema,
        /** Зоны помещений. */
        rooms: z.array(RoomZoneSchema),
        /** Стены и проёмы. */
        walls: z.array(WallSchema),
        /** Узлы графа. */
        nodes: z.array(GraphNodeSchema),
        /** Кабельные линии. */
        edges: z.array(GraphEdgeSchema),
    })
    .check((context) => {
        const graph = context.value;
        const addIssue = (path: PropertyKey[], message: string): void => {
            context.issues.push({ code: 'custom', message, path, input: graph });
        };

        const checkUnique = (values: readonly { id: string }[], section: string): void => {
            const seen = new Set<string>();
            values.forEach((item, index) => {
                if (seen.has(item.id)) {
                    addIssue([section, index, 'id'], `Идентификатор в ${section} должен быть уникальным`);
                }
                seen.add(item.id);
            });
        };

        checkUnique(graph.rooms, 'rooms');
        checkUnique(graph.walls, 'walls');
        checkUnique(graph.nodes, 'nodes');

        const nodeIds = new Set(graph.nodes.map((node) => node.id));
        const edgeIds = new Set<string>();
        graph.edges.forEach((edge, index) => {
            if (edgeIds.has(edge.id)) {
                addIssue(['edges', index, 'id'], 'Идентификатор линии должен быть уникальным');
            }
            edgeIds.add(edge.id);
            if (!nodeIds.has(edge.from)) {
                addIssue(['edges', index, 'from'], 'Линия ссылается на несуществующий узел');
            }
            if (!nodeIds.has(edge.to)) {
                addIssue(['edges', index, 'to'], 'Линия ссылается на несуществующий узел');
            }
        });
    });

/** Канонический граф проекта. */
export type ProjectGraph = z.infer<typeof ProjectGraphSchema>;

/** Файл проекта `.vwc`: обёртка над графом (RULES § 5.4). */
export const VwcFileSchema = z.object({
    /** Маркер формата. */
    format: z.literal('vwc-project'),
    /** Версия файла. */
    schemaVersion: z.literal(1),
    /** Граф проекта. */
    graph: ProjectGraphSchema,
    /** Время сохранения, ISO 8601. */
    savedAt: z.iso.datetime(),
});
/** Файл проекта `.vwc`. */
export type VwcFile = z.infer<typeof VwcFileSchema>;

/**
 * Создаёт пустой валидный граф проекта.
 *
 * @param name — название проекта.
 * @param graphId — идентификатор графа; по умолчанию генерируется UUID.
 * @returns граф с пустыми rooms/walls/nodes/edges и неоткалиброванным масштабом.
 */
export function createEmptyProjectGraph(
    name = 'Новый проект',
    graphId: Uuid = crypto.randomUUID(),
): ProjectGraph {
    return {
        schemaVersion: 1,
        id: graphId,
        name,
        floorPlan: {
            background: null,
            scaleMetersPerPx: null,
            ceilingHeightM: 2.7,
        },
        rooms: [],
        walls: [],
        nodes: [],
        edges: [],
    };
}

/**
 * Валидирует граф проекта на границе внешних данных.
 *
 * @param value — данные из HTTP, БД или файла `.vwc`.
 * @returns провалидированный граф.
 * @throws {ZodError} если граф некорректен.
 */
export function parseProjectGraph(value: unknown): ProjectGraph {
    return ProjectGraphSchema.parse(value);
}

/**
 * Переводит точку из пикселей в метры.
 *
 * @param point — точка в пикселях.
 * @param scaleMetersPerPx — масштаб: m/px.
 * @returns точка в метрах.
 */
export function pixelsToMeters(point: Point, scaleMetersPerPx: number): Point {
    return { x: point.x * scaleMetersPerPx, y: point.y * scaleMetersPerPx };
}

/**
 * Переводит точку из метров в пиксели.
 *
 * @param point — точка в метрах.
 * @param scaleMetersPerPx — масштаб: m/px.
 * @returns точка в пикселях.
 */
export function metersToPixels(point: Point, scaleMetersPerPx: number): Point {
    return { x: point.x / scaleMetersPerPx, y: point.y / scaleMetersPerPx };
}

/** Тип объекта недвижимости. */
export const ObjectTypeSchema = z.enum(['house', 'apartment', 'commercial']);
/** Тип объекта. */
export type ObjectType = z.infer<typeof ObjectTypeSchema>;

/** Система заземления электроустановки (ПУЭ-7). */
export const NetworkSystemSchema = z.enum(['tn-s', 'tn-c-s', 'tn-c', 'tt', 'it']);
/** Система заземления. */
export type NetworkSystem = z.infer<typeof NetworkSystemSchema>;

/** Тело запроса `POST /projects`. */
export const CreateProjectDtoSchema = z.object({
    /** Название проекта. */
    title: z.string().min(1).max(200),
    /** Тип объекта. */
    objectType: ObjectTypeSchema,
    /** Система заземления. */
    networkSystem: NetworkSystemSchema,
});
/** DTO создания проекта. */
export type CreateProjectDto = z.infer<typeof CreateProjectDtoSchema>;

/** Тело запроса `PUT /projects/:id/graph`. */
export const UpdateProjectGraphDtoSchema = z.object({
    /** Новый граф проекта. */
    graph: ProjectGraphSchema,
});
/** DTO сохранения графа. */
export type UpdateProjectGraphDto = z.infer<typeof UpdateProjectGraphDtoSchema>;

/** Проект, возвращаемый API. */
export const ProjectDtoSchema = z.object({
    /** Идентификатор проекта. */
    id: UuidSchema,
    /** Название. */
    title: z.string(),
    /** Тип объекта. */
    objectType: ObjectTypeSchema,
    /** Система заземления. */
    networkSystem: NetworkSystemSchema,
    /** Граф проекта. */
    graph: ProjectGraphSchema,
    /** Время создания, ISO 8601. */
    createdAt: z.iso.datetime(),
    /** Время обновления, ISO 8601. */
    updatedAt: z.iso.datetime(),
});
/** DTO проекта. */
export type ProjectDto = z.infer<typeof ProjectDtoSchema>;

/** Результат загрузки подложки. */
export const FloorPlanUploadDtoSchema = z.object({
    /** Идентификатор записи. */
    id: UuidSchema,
    /** Идентификатор проекта. */
    projectId: UuidSchema,
    /** Ключ объекта в хранилище. */
    storageKey: z.string().min(1),
    /** Оригинальное имя файла. */
    fileName: z.string().min(1),
    /** Подтверждённый формат. */
    kind: BackgroundKindSchema,
    /** MIME-тип по magic bytes. */
    mimeType: z.string().min(1),
    /** Размер файла в байтах. */
    sizeBytes: z.number().int().nonnegative(),
    /** Время загрузки, ISO 8601. */
    createdAt: z.iso.datetime(),
});
/** DTO загруженной подложки. */
export type FloorPlanUploadDto = z.infer<typeof FloorPlanUploadDtoSchema>;

/** Запрос расчёта длины кабельной линии. */
export const CalculateCableLengthRequestSchema = z.object({
    /** Точки трассы, px. */
    waypointsPx: z.array(PointSchema),
    /** Масштаб: m/px. */
    scaleMetersPerPx: z.number().positive(),
    /** Высота потолка, m. */
    ceilingHeightM: z.number().nonnegative(),
    /** Высота установки источника, m. */
    sourceMountHeightM: z.number().nonnegative(),
    /** Высота установки приёмника, m. */
    targetMountHeightM: z.number().nonnegative(),
    /** Коэффициент запаса; по умолчанию 1.15 (подставляется ядром). */
    reserveFactor: z.number().min(1).optional(),
});
/** Запрос расчёта длины. */
export type CalculateCableLengthRequest = z.infer<typeof CalculateCableLengthRequestSchema>;

/** Ответ расчёта длины кабельной линии. */
export const CalculateCableLengthResponseSchema = z.object({
    /** Итоговая длина с запасом, m. */
    lengthM: z.number().nonnegative(),
    /** Горизонтальная составляющая, m. */
    horizontalLengthM: z.number().nonnegative(),
    /** Вертикальная составляющая, m. */
    verticalLengthM: z.number().nonnegative(),
    /** Применённый коэффициент запаса. */
    reserveFactor: z.number().min(1),
    /** Число точек трассы. */
    waypointsCount: z.number().int().nonnegative(),
});
/** Ответ расчёта длины. */
export type CalculateCableLengthResponse = z.infer<typeof CalculateCableLengthResponseSchema>;
