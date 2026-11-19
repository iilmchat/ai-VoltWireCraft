// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/**
 * Канонический контракт бэкенда: граф проекта `.vwc` и API-контракты.
 *
 * Файл — единственный источник истины для API и расчётного ядра. Модули
 * `graph.ts`/`cable.ts` и функции в `index.ts` оставлены для совместимости с
 * текущим web-редактором и будут консолидированы отдельно (см. KI-001).
 *
 * Геометрия хранится в пикселях подложки; физические длины — в базовых
 * единицах СИ: метры (`m`), сечения — `mm2`, мощности — `W` (RULES § 5.3).
 */

import { z } from 'zod';

/** Идентификатор сущности графа: UUID версии 1–5 (RULES § 4.11). */
export const UuidSchema = z.uuid();
/** Тип идентификатора сущности графа. */
export type Uuid = z.infer<typeof UuidSchema>;

/** Точка трассы или полигона в координатах подложки (пикселях). */
export const PointPxSchema = z.object({
    /** Горизонтальная координата, px. */
    x: z.number().finite(),
    /** Вертикальная координата, px. */
    y: z.number().finite(),
});
/** Точка в координатах подложки. */
export type PointPx = z.infer<typeof PointPxSchema>;

/** Допустимые форматы загружаемой подложки. */
export const FloorPlanImageKindSchema = z.enum(['pdf', 'png', 'jpg']);
/** Формат загружаемой подложки. */
export type FloorPlanImageKind = z.infer<typeof FloorPlanImageKindSchema>;

/**
 * Метаданные файла подложки, сохранённого в S3 или локальном хранилище.
 * MIME-тип проверен по magic bytes на границе API (RULES § 6.5).
 */
export const FloorPlanBackgroundSchema = z.object({
    /** Ключ объекта в хранилище. */
    storageKey: z.string().min(1),
    /** Логический формат файла. */
    kind: FloorPlanImageKindSchema,
    /** Оригинальное имя файла. */
    fileName: z.string().min(1),
    /** Подтверждённый MIME-тип. */
    mimeType: z.string().min(1),
    /** Размер файла в байтах (не более 25 МБ). */
    sizeBytes: z.number().int().nonnegative().max(25 * 1024 * 1024),
    /** Момент загрузки в ISO 8601. */
    uploadedAt: z.iso.datetime(),
});
/** Метаданные подложки. */
export type FloorPlanBackground = z.infer<typeof FloorPlanBackgroundSchema>;

/**
 * План этажа: привязка подложки, масштаб и высота потолка.
 * `scaleMetersPerPx` и `ceilingHeightM` нужны расчётному ядру.
 */
export const FloorPlanSchema = z.object({
    /** Идентификатор плана. */
    id: UuidSchema,
    /** Человекочитаемое название, например «1-й этаж». */
    name: z.string().min(1).max(200),
    /** Подложка; `null`, если план создан вручную. */
    background: FloorPlanBackgroundSchema.nullable(),
    /** Ширина холста подложки, px. */
    widthPx: z.number().positive(),
    /** Высота холста подложки, px. */
    heightPx: z.number().positive(),
    /** Масштаб: метров на один пиксель подложки. */
    scaleMetersPerPx: z.number().positive(),
    /** Высота потолка, m. */
    ceilingHeightM: z.number().positive(),
});
/** План этажа. */
export type FloorPlan = z.infer<typeof FloorPlanSchema>;

/** Назначение помещения. */
export const RoomZoneKindSchema = z.enum([
    'living',
    'kitchen',
    'wet',
    'corridor',
    'utility',
    'outdoor',
    'other',
]);
/** Назначение помещения. */
export type RoomZoneKind = z.infer<typeof RoomZoneKindSchema>;

/** Зона помещения на плане этажа (полигон в пикселях). */
export const RoomZoneSchema = z.object({
    /** Идентификатор зоны. */
    id: UuidSchema,
    /** План этажа, которому принадлежит зона. */
    floorPlanId: UuidSchema,
    /** Название помещения. */
    name: z.string().min(1).max(200),
    /** Назначение помещения. */
    kind: RoomZoneKindSchema,
    /** Вершины полигона (не менее трёх), px. */
    polygonPx: z.array(PointPxSchema).min(3),
});
/** Зона помещения. */
export type RoomZone = z.infer<typeof RoomZoneSchema>;

/** Вид узла графа: ЭУИ, щит НКУ, источник или нагрузка. */
export const GraphNodeKindSchema = z.enum([
    'source',
    'panel',
    'socket',
    'switch',
    'luminaire',
    'junction',
    'load',
    'other',
]);
/** Вид узла графа. */
export type GraphNodeKind = z.infer<typeof GraphNodeKindSchema>;

/**
 * Узел графа проекта — электроустановочное изделие или устройство.
 * Высота установки `mountHeightM` измеряется от чистого пола, m.
 */
export const GraphNodeSchema = z.object({
    /** Идентификатор узла. */
    id: UuidSchema,
    /** План этажа, на котором расположен узел. */
    floorPlanId: UuidSchema,
    /** Помещение; `null`, если узел не привязан к зоне. */
    roomZoneId: UuidSchema.nullable(),
    /** Вид узла. */
    kind: GraphNodeKindSchema,
    /** Подпись узла (например, «Розетка Р1»). */
    label: z.string().min(1).max(128),
    /** Положение узла на подложке, px. */
    positionPx: PointPxSchema,
    /** Высота установки от пола, m. */
    mountHeightM: z.number().nonnegative(),
    /** Номинальная мощность, W; `null`, если не задана. */
    ratedPowerW: z.number().nonnegative().nullable(),
});
/** Узел графа проекта. */
export type GraphNode = z.infer<typeof GraphNodeSchema>;

/** Назначение кабельной линии. */
export const GraphEdgeKindSchema = z.enum(['power', 'lighting', 'data', 'other']);
/** Назначение кабельной линии. */
export type GraphEdgeKind = z.infer<typeof GraphEdgeKindSchema>;

/**
 * Ребро графа — кабельная линия между узлами.
 * Точки `waypointsPx` задают трассу; длину считает расчётное ядро.
 */
export const GraphEdgeSchema = z.object({
    /** Идентификатор ребра. */
    id: UuidSchema,
    /** Исходный узел. */
    sourceNodeId: UuidSchema,
    /** Конечный узел. */
    targetNodeId: UuidSchema,
    /** Назначение линии. */
    kind: GraphEdgeKindSchema,
    /** Точки ломаной трассы (не менее двух), px. */
    waypointsPx: z.array(PointPxSchema).min(2),
    /** Сечение токопроводящей жилы, mm2. */
    crossSectionMm2: z.number().positive(),
});
/** Ребро графа проекта. */
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

/**
 * Граф проекта — единственный источник истины для плана этажа и схемы
 * (RULES § 5.2). Дополнительно проверяются ссылочная целостность и уникальность
 * идентификаторов; ошибки возвращаются с путём к конкретному полю.
 */
export const ProjectGraphSchema = z
    .object({
        /** Версия формата графа. */
        schemaVersion: z.literal(1),
        /** Идентификатор проекта. */
        id: UuidSchema,
        /** Название проекта. */
        name: z.string().min(1).max(200),
        /** Планы этажей. */
        floorPlans: z.array(FloorPlanSchema),
        /** Зоны помещений. */
        roomZones: z.array(RoomZoneSchema),
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

        const floorPlanIds = new Set<string>();
        graph.floorPlans.forEach((plan, index) => {
            if (floorPlanIds.has(plan.id)) {
                addIssue(['floorPlans', index, 'id'], 'Идентификатор плана должен быть уникальным');
            }
            floorPlanIds.add(plan.id);
        });

        const roomZoneIds = new Set<string>();
        graph.roomZones.forEach((zone, index) => {
            if (roomZoneIds.has(zone.id)) {
                addIssue(['roomZones', index, 'id'], 'Идентификатор зоны должен быть уникальным');
            }
            roomZoneIds.add(zone.id);
            if (!floorPlanIds.has(zone.floorPlanId)) {
                addIssue(['roomZones', index, 'floorPlanId'], 'Зона ссылается на несуществующий план этажа');
            }
        });

        const nodeIds = new Set<string>();
        graph.nodes.forEach((node, index) => {
            if (nodeIds.has(node.id)) {
                addIssue(['nodes', index, 'id'], 'Идентификатор узла должен быть уникальным');
            }
            nodeIds.add(node.id);
            if (!floorPlanIds.has(node.floorPlanId)) {
                addIssue(['nodes', index, 'floorPlanId'], 'Узел ссылается на несуществующий план этажа');
            }
            if (node.roomZoneId !== null && !roomZoneIds.has(node.roomZoneId)) {
                addIssue(['nodes', index, 'roomZoneId'], 'Узел ссылается на несуществующую зону помещения');
            }
        });

        const edgeIds = new Set<string>();
        graph.edges.forEach((edge, index) => {
            if (edgeIds.has(edge.id)) {
                addIssue(['edges', index, 'id'], 'Идентификатор линии должен быть уникальным');
            }
            edgeIds.add(edge.id);
            if (!nodeIds.has(edge.sourceNodeId)) {
                addIssue(['edges', index, 'sourceNodeId'], 'Линия ссылается на несуществующий узел');
            }
            if (!nodeIds.has(edge.targetNodeId)) {
                addIssue(['edges', index, 'targetNodeId'], 'Линия ссылается на несуществующий узел');
            }
        });
    });

/** Граф проекта. */
export type ProjectGraph = z.infer<typeof ProjectGraphSchema>;

/** Файл проекта `.vwc`: JSON-обёртка над графом (RULES § 5.4). */
export const VwcFileSchema = z.object({
    /** Маркер формата. */
    format: z.literal('vwc-project'),
    /** Версия файла. */
    schemaVersion: z.literal(1),
    /** Граф проекта. */
    graph: ProjectGraphSchema,
    /** Время сохранения в ISO 8601. */
    savedAt: z.iso.datetime(),
});
/** Файл проекта `.vwc`. */
export type VwcFile = z.infer<typeof VwcFileSchema>;

/** Тип объектной сети: жилой дом, квартира или коммерческая недвижимость. */
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
    /** Название проекта. */
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

/** Результат загрузки подложки плана этажа. */
export const FloorPlanUploadDtoSchema = z.object({
    /** Идентификатор записи о подложке. */
    id: UuidSchema,
    /** Идентификатор проекта. */
    projectId: UuidSchema,
    /** Ключ объекта в хранилище. */
    storageKey: z.string().min(1),
    /** Оригинальное имя файла. */
    fileName: z.string().min(1),
    /** Подтверждённый формат. */
    kind: FloorPlanImageKindSchema,
    /** MIME-тип по magic bytes. */
    mimeType: z.string().min(1),
    /** Размер файла в байтах. */
    sizeBytes: z.number().int().nonnegative(),
    /** Время загрузки, ISO 8601. */
    createdAt: z.iso.datetime(),
});
/** DTO загруженной подложки. */
export type FloorPlanUploadDto = z.infer<typeof FloorPlanUploadDtoSchema>;

/** Тело запроса расчёта длины кабельной линии. */
export const CalculateCableLengthRequestSchema = z.object({
    /** Точки трассы, px (ноль или одна точка — нулевая трасса). */
    waypointsPx: z.array(PointPxSchema),
    /** Масштаб: метров на пиксель. */
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
/** Запрос расчёта длины кабеля. */
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
/** Ответ расчёта длины кабеля. */
export type CalculateCableLengthResponse = z.infer<typeof CalculateCableLengthResponseSchema>;

/**
 * Создаёт пустой валидный граф проекта.
 *
 * @param name — название проекта.
 * @param graphId — идентификатор графа; по умолчанию генерируется UUID.
 * @returns граф с нулевым числом планов, зон, узлов и линий.
 */
export function createEmptyProjectGraph(
    name = 'Новый проект',
    graphId: Uuid = crypto.randomUUID(),
): ProjectGraph {
    return {
        schemaVersion: 1,
        id: graphId,
        name,
        floorPlans: [],
        roomZones: [],
        nodes: [],
        edges: [],
    };
}

/**
 * Переводит координату из пикселей в метры.
 *
 * @param point — точка в пикселях.
 * @param scaleMetersPerPx — масштаб: метров на пиксель.
 * @returns точка в метрах.
 */
export function pixelsToMeters(point: PointPx, scaleMetersPerPx: number): PointPx {
    return { x: point.x * scaleMetersPerPx, y: point.y * scaleMetersPerPx };
}

/**
 * Переводит координату из метров в пиксели.
 *
 * @param point — точка в метрах.
 * @param scaleMetersPerPx — масштаб: метров на пиксель.
 * @returns точка в пикселях.
 */
export function metersToPixels(point: PointPx, scaleMetersPerPx: number): PointPx {
    return { x: point.x / scaleMetersPerPx, y: point.y / scaleMetersPerPx };
}
