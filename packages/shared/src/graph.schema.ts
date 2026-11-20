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
    /** Число полюсов ввода у узла `input_source`: '1P' или '3P'. */
    phase: z.enum(['1P', '3P']).optional(),
    /** Напряжение ввода, V. */
    voltageV: z.union([z.literal(220), z.literal(230), z.literal(400)]).optional(),
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
    /** Ссылка на позицию каталога `catalog_devices` (schemeVersion 2). */
    catalogDeviceId: UuidSchema.nullable().optional(),
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
    /** Расчётный ток линии, A (результат `line-sizing`). */
    calculatedCurrentA: z.number().nonnegative().optional(),
    /** Потеря напряжения, % (результат `line-sizing`). */
    voltageDropPercent: z.number().nonnegative().optional(),
    /** Минимальный ток однофазного КЗ, A (результат `short-circuit`). */
    shortCircuitCurrentA: z.number().nonnegative().optional(),
});
/** Параметры кабеля. */
export type CableSpecs = z.infer<typeof CableSpecsSchema>;

/** Тип линии графа: кабельная трасса. */
export const CABLE_LINE_EDGE_TYPE = 'cable_line' as const;

/** Ребро графа версии 1: координаты трассы в пикселях подложки. */
export const GraphEdgeSchemaV1 = z.object({
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
/** Ребро графа версии 1. */
export type GraphEdgeV1 = z.infer<typeof GraphEdgeSchemaV1>;

/**
 * Ребро графа версии 2: расчётные координаты трассы хранятся в метрах СИ.
 * Пиксельные точки остаются только как кэш холста редактора.
 */
export const GraphEdgeSchema = z.object({
    /** Идентификатор линии. */
    id: UuidSchema,
    /** Исходный узел. */
    from: UuidSchema,
    /** Конечный узел. */
    to: UuidSchema,
    /** Параметры кабеля и результаты расчётов. */
    cableSpecs: CableSpecsSchema,
    /** Точки трассы в метрах СИ (обязательно для кабельных линий). */
    waypointsM: z.array(PointSchema).min(2),
    /** Пиксельный кэш для Konva.js; не используется в расчётах. */
    waypointsPx: z.array(PointSchema).optional(),
    /** Тип линии; для кабельных трасс — `'cable_line'`. */
    edgeType: z.literal('cable_line').optional(),
    /** Марка кабеля, например «ВВГнг(А)-LS». */
    cableBrand: z.string().min(1).optional(),
});
/** Ребро графа проекта (версия 2). */
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

/** Минимальная структура графа для проверки ссылочной целостности. */
interface GraphReferences {
    /** Зоны. */
    readonly rooms: readonly { readonly id: string }[];
    /** Стены. */
    readonly walls: readonly { readonly id: string }[];
    /** Узлы. */
    readonly nodes: readonly { readonly id: string }[];
    /** Линии. */
    readonly edges: readonly { readonly id: string; readonly from: string; readonly to: string }[];
}

/**
 * Проверяет уникальность идентификаторов и ссылки линий на узлы графа.
 *
 * @param graph — проверяемый граф.
 * @param addIssue — регистратор ошибки с путём к полю.
 */
function validateGraphReferences(
    graph: GraphReferences,
    addIssue: (path: PropertyKey[], message: string) => void,
): void {
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
}

/** Граф проекта версии 1 (пиксельные координаты), используется только мигратором. */
export const ProjectGraphSchemaV1 = z
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
        edges: z.array(GraphEdgeSchemaV1),
    })
    .check((context) => {
        validateGraphReferences(context.value, (path, message) => {
            context.issues.push({ code: 'custom', message, path, input: context.value });
        });
    });
/** Граф проекта версии 1. */
export type ProjectGraphV1 = z.infer<typeof ProjectGraphSchemaV1>;

/** Данные основной надписи (штампа) по ГОСТ Р 21.101. */
export const StampMetaSchema = z.object({
    /** Код проекта. */
    projectCode: z.string().min(1).optional(),
    /** Фамилия разработчика. */
    designerName: z.string().min(1).optional(),
    /** Фамилия проверяющего. */
    reviewerName: z.string().min(1).optional(),
    /** Наименование организации. */
    organizationName: z.string().min(1).optional(),
    /** Стадия проектирования. */
    stage: z.string().min(1).optional(),
});
/** Данные штампа ГОСТ. */
export type StampMeta = z.infer<typeof StampMetaSchema>;

/**
 * Канонический граф проекта версии 2: координаты трасс — в метрах СИ.
 * Единый источник истины для БД, API, клиента и `.vwc` (RULES § 5.2, KI-003).
 */
export const ProjectGraphSchema = z
    .object({
        /** Версия формата. */
        schemaVersion: z.literal(2),
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
        /** Штамп ГОСТ; не влияет на расчёты. */
        stampMeta: StampMetaSchema.optional(),
        /** Метаданные проекта: топология ввода и число полюсов щита. */
        meta: z
            .object({
                /** Система заземления (ПУЭ-7). */
                networkSystem: z.enum(['tn-s', 'tn-c-s', 'tn-c', 'tt', 'it']).optional(),
                /** Топология ввода. */
                supplyTopology: z.enum(['1P_230V', '3P_400V']).optional(),
                /** Число полюсов вводного аппарата. */
                panelPoles: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
            })
            .optional(),
    })
    .check((context) => {
        validateGraphReferences(context.value, (path, message) => {
            context.issues.push({ code: 'custom', message, path, input: context.value });
        });
    });
/** Канонический граф проекта (версия 2). */
export type ProjectGraph = z.infer<typeof ProjectGraphSchema>;

/** Узлы щита, которым назначается `panelSlot` при миграции v1 → v2. */
const PANEL_NODE_KINDS: ReadonlySet<string> = new Set([
    'panel',
    'circuit_breaker',
    'rcd',
    'rcbo',
]);

/** Отчёт о детерминированной миграции графа v1 → v2. */
export interface ProjectGraphMigrationReport {
    /** Исходная версия. */
    readonly fromVersion: 1;
    /** Целевая версия. */
    readonly toVersion: 2;
    /** Число переведённых в метры точек трассы. */
    readonly convertedWaypoints: number;
    /** Число назначенных позиций в щите. */
    readonly assignedPanelSlots: number;
    /** Предупреждения (например, отсутствие масштаба). */
    readonly warnings: readonly string[];
}

/** Результат миграции: граф v2 и отчёт. */
export interface ProjectGraphMigrationResult {
    /** Смигрированный граф. */
    readonly graph: ProjectGraph;
    /** Отчёт. */
    readonly report: ProjectGraphMigrationReport;
}

/** Округление до 1 мкм. */
function roundToMicrometer(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Детерминированно мигрирует граф версии 1 в версию 2.
 *
 * @param raw — внешние данные графа v1 (например, содержимое `.vwc`).
 * @returns граф v2 и отчёт с числом преобразованных точек.
 * @throws {ZodError} если исходный или целевой граф не проходит валидацию.
 */
export function migrateProjectGraphV1ToV2WithReport(raw: unknown): ProjectGraphMigrationResult {
    const v1 = ProjectGraphSchemaV1.parse(raw);
    const warnings: string[] = [];
    const scale = v1.floorPlan.scaleMetersPerPx;
    if (scale === null) {
        warnings.push('scaleMetersPerPx is null — координаты переведены с масштабом 1 м/px');
    }

    let nextSlot = 1;
    let assignedPanelSlots = 0;
    const nodes = v1.nodes.map((node) => {
        if (node.panelSlot === null && PANEL_NODE_KINDS.has(node.kind)) {
            assignedPanelSlots += 1;
            return { ...node, panelSlot: nextSlot++, catalogDeviceId: null };
        }
        return { ...node, catalogDeviceId: null };
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    let convertedWaypoints = 0;
    const edges = v1.edges.map((edge) => {
        const source = nodeById.get(edge.from);
        const target = nodeById.get(edge.to);
        const pixels =
            edge.waypointsPx ??
            [source?.planPosition, target?.planPosition].filter(
                (point): point is NonNullable<typeof point> => point !== undefined && point !== null,
            );
        const waypointsM = pixels.map((point) => ({
            x: roundToMicrometer(point.x * (scale ?? 1)),
            y: roundToMicrometer(point.y * (scale ?? 1)),
        }));
        convertedWaypoints += waypointsM.length;
        return { ...edge, waypointsM };
    });

    const graph = ProjectGraphSchema.parse({
        ...v1,
        schemaVersion: 2,
        nodes,
        edges,
    });

    return {
        graph,
        report: {
            fromVersion: 1,
            toVersion: 2,
            convertedWaypoints,
            assignedPanelSlots,
            warnings,
        },
    };
}

/**
 * Детерминированно мигрирует граф версии 1 в версию 2 (без отчёта).
 *
 * @param raw — внешние данные графа v1.
 * @returns граф версии 2.
 * @throws {ZodError} если граф некорректен.
 */
export function migrateProjectGraphV1ToV2(raw: unknown): ProjectGraph {
    return migrateProjectGraphV1ToV2WithReport(raw).graph;
}

/** Файл проекта `.vwc` версии 1 (для автоматической миграции). */
export const VwcFileSchemaV1 = z.object({
    /** Маркер формата. */
    format: z.literal('vwc-project'),
    /** Версия файла. */
    schemaVersion: z.literal(1),
    /** Граф версии 1. */
    graph: ProjectGraphSchemaV1,
    /** Время сохранения, ISO 8601. */
    savedAt: z.iso.datetime(),
});
/** Файл проекта `.vwc` версии 1. */
export type VwcFileV1 = z.infer<typeof VwcFileSchemaV1>;

/** Файл проекта `.vwc` версии 2. */
export const VwcFileSchema = z.object({
    /** Маркер формата. */
    format: z.literal('vwc-project'),
    /** Версия файла. */
    schemaVersion: z.literal(2),
    /** Граф проекта. */
    graph: ProjectGraphSchema,
    /** Время сохранения, ISO 8601. */
    savedAt: z.iso.datetime(),
});
/** Файл проекта `.vwc` (версия 2). */
export type VwcFile = z.infer<typeof VwcFileSchema>;

/**
 * Читает `.vwc` любой версии: v1 автоматически мигрируется в v2.
 *
 * @param raw — внешние данные файла проекта.
 * @returns файл с каноническим графом версии 2.
 * @throws {ZodError} если формат или граф некорректны.
 */
export function parseVwcFile(raw: unknown): VwcFile {
    const current = VwcFileSchema.safeParse(raw);
    if (current.success) {
        return current.data;
    }
    const legacy = VwcFileSchemaV1.parse(raw);
    return {
        format: 'vwc-project',
        schemaVersion: 2,
        graph: migrateProjectGraphV1ToV2(legacy.graph),
        savedAt: legacy.savedAt,
    };
}

/**
 * Создаёт пустой валидный граф проекта версии 2.
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
        schemaVersion: 2,
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
 * @returns провалидированный граф версии 2; v1 мигрируется автоматически.
 * @throws {ZodError} если граф некорректен.
 */
export function parseProjectGraph(value: unknown): ProjectGraph {
    const current = ProjectGraphSchema.safeParse(value);
    if (current.success) {
        return current.data;
    }
    return migrateProjectGraphV1ToV2(value);
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

/** Стена, извлечённая из CAD-плана (координаты в метрах СИ). */
export const CadWallSchema = z.object({
    /** Вид конструктива. */
    kind: z.enum(['wall', 'partition', 'doorway', 'window']),
    /** Точки контура, m. */
    path: z.array(PointSchema).min(2),
    /** Толщина, m. */
    thickness: z.number().nonnegative(),
});
/** Стена из CAD. */
export type CadWall = z.infer<typeof CadWallSchema>;

/** Ответ разбора CAD-файла. */
export const CadParseResponseSchema = z.object({
    /** Стены в метрах СИ. */
    walls: z.array(CadWallSchema),
    /** Исходные единицы чертежа. */
    units: z.string().min(1),
    /** Число обработанных сущностей. */
    entitiesProcessed: z.number().int().nonnegative(),
    /** Предупреждения разбора. */
    warnings: z.array(z.string()),
    /** Версия справочника правил. */
    rulesVersion: z.string().min(1),
});
/** Ответ разбора CAD. */
export type CadParseResponse = z.infer<typeof CadParseResponseSchema>;

/** Допустимые напряжения потребительской сети, В (ПУЭ-7). */
export const SupplyVoltageSchema = z.union([z.literal(220), z.literal(230), z.literal(400)]);
/** Напряжение сети. */
export type SupplyVoltage = z.infer<typeof SupplyVoltageSchema>;

/** Число фаз ввода. */
export const PhasesSchema = z.union([z.literal(1), z.literal(3)]);
/** Число фаз. */
export type Phases = z.infer<typeof PhasesSchema>;

/** Способ прокладки кабеля: базовый — в трубе/штробе (DESIGN_V020 § 8). */
export const InstallationMethodSchema = z.enum(['conduit', 'air']);
/** Способ прокладки. */
export type InstallationMethod = z.infer<typeof InstallationMethodSchema>;

/** Вид потребителя — влияет на выбор уставки УЗО. */
export const ConsumerKindSchema = z.enum(['socket', 'light', 'appliance', 'other']);
/** Вид потребителя. */
export type ConsumerKind = z.infer<typeof ConsumerKindSchema>;

/** Стандартные сечения медных жил, мм² (ПУЭ-7 табл. 1.3.4). */
export const CrossSectionSchema = z.union([
    z.literal(1.5),
    z.literal(2.5),
    z.literal(4),
    z.literal(6),
    z.literal(10),
    z.literal(16),
]);
/** Сечение жилы из стандартного ряда. */
export type CrossSection = z.infer<typeof CrossSectionSchema>;

/** Запрос расчёта потребительской линии. */
export const LineSizingRequestSchema = z.object({
    /** Расчётная мощность потребителя, W. */
    powerW: z.number().positive(),
    /** Напряжение сети, V. */
    voltageV: SupplyVoltageSchema,
    /** Число фаз. */
    phases: PhasesSchema,
    /** Коэффициент мощности cosφ (0,1 … 1). */
    powerFactor: z.number().min(0.1).max(1),
    /** Длина кабельной линии, m. */
    lengthM: z.number().positive(),
    /** Способ прокладки; по умолчанию 'conduit'. */
    installationMethod: InstallationMethodSchema.optional(),
    /** Вид потребителя; по умолчанию 'other'. */
    consumerKind: ConsumerKindSchema.optional(),
    /** Тип помещения; влияет на рекомендацию УЗО. */
    roomType: RoomZoneTypeSchema.optional(),
    /** Предельная потеря напряжения, %; по умолчанию 5. */
    maxVoltageDropPercent: z.number().positive().max(100).optional(),
});
/** Запрос расчёта линии. */
export type LineSizingRequest = z.infer<typeof LineSizingRequestSchema>;

/** Рекомендация расчётного ядра (строка на русском языке). */
export const CalculationRecommendationSchema = z.string().min(1);
/** Рекомендация. */
export type CalculationRecommendation = z.infer<typeof CalculationRecommendationSchema>;

/** Ответ расчёта потребительской линии. */
export const LineSizingResponseSchema = z.object({
    /** Расчётный ток, A. */
    designCurrentA: z.number().positive(),
    /** Выбранное сечение жилы, mm2. */
    selectedCrossSectionMm2: CrossSectionSchema,
    /** Допустимый длительный ток для выбранного сечения, A. */
    permissibleCurrentA: z.number().positive(),
    /** Потеря напряжения, %. */
    voltageDropPercent: z.number().nonnegative(),
    /** Предельная потеря напряжения, %. */
    voltageDropLimitPercent: z.number().positive(),
    /** Рекомендуемый номинал автоматического выключателя, A. */
    breakerRatingA: z.number().int().positive(),
    /** Рекомендуемая уставка УЗО, mA. */
    rcdCurrentMa: z.number().int().nonnegative(),
    /** Требуется ли УЗО на линии. */
    rcdRequired: z.boolean(),
    /** Марка кабеля. */
    cableType: z.string().min(1),
    /** Рекомендации на русском языке. */
    recommendations: z.array(CalculationRecommendationSchema),
    /** Идентификаторы пунктов из `PUE_RULES_V02.md`. */
    references: z.array(z.string().min(1)),
    /** Версия справочника правил. */
    rulesVersion: z.string().min(1),
});
/** Ответ расчёта линии. */
export type LineSizingResponse = z.infer<typeof LineSizingResponseSchema>;

/** Запрос детерминированной автосборки щита. */
export const AutoPanelRequestSchema = z.object({
    /** Узлы графа проекта. */
    nodes: z.array(GraphNodeSchema),
    /** Зоны помещений для определения типа среды. */
    rooms: z.array(RoomZoneSchema),
    /** Параметры ввода; по умолчанию 230 В, одна фаза. */
    supply: z
        .object({
            voltageV: SupplyVoltageSchema,
            phases: PhasesSchema,
            /** Топология ввода, переданная агентом из `ProjectGraph.meta`. */
            supplyTopology: z.enum(['1P_230V', '3P_400V']).optional(),
            /** Число полюсов вводного аппарата: 2 для 1P, 3 или 4 для 3P. */
            panelPoles: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
        })
        .optional(),
    /** Топология ввода, извлекаемая агентом из `ProjectGraph.meta`. */
    supplyTopology: z.enum(['1P_230V', '3P_400V']).optional(),
    /** Число полюсов вводного аппарата. */
    panelPoles: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    /** Желаемый бренд модулей; учитывается агентом при выборе артикула. */
    preferredBrand: z.enum(['IEK', 'EKF', 'КЭАЗ']).optional(),
});
/** Запрос автосборки щита. */
export type AutoPanelRequest = z.infer<typeof AutoPanelRequestSchema>;

/** Фаза ввода. */
export const PhaseSchema = z.enum(['L1', 'L2', 'L3']);
/** Фаза. */
export type Phase = z.infer<typeof PhaseSchema>;

/** Группа потребителей в щите. */
export const PanelGroupSchema = z.object({
    /** Идентификатор группы. */
    id: z.string().min(1),
    /** Название группы. */
    name: z.string().min(1),
    /** Помещение; `null` для мощных приборов без привязки. */
    roomId: UuidSchema.nullable(),
    /** Фаза ввода. */
    phase: PhaseSchema,
    /** Идентификаторы узлов-потребителей. */
    consumerIds: z.array(UuidSchema),
    /** Суммарная мощность, W. */
    totalPowerW: z.number().nonnegative(),
    /** Расчётный ток, A. */
    designCurrentA: z.number().nonnegative(),
    /** Сечение жилы, mm2. */
    crossSectionMm2: CrossSectionSchema,
    /** Номинал автомата, A. */
    breakerRatingA: z.number().int().positive(),
    /** Уставка УЗО, mA. */
    rcdCurrentMa: z.number().int().nonnegative(),
    /** Место на DIN-рейке. */
    panelSlot: z.number().int().positive().nullable(),
});
/** Группа потребителей. */
export type PanelGroup = z.infer<typeof PanelGroupSchema>;

/** Нагрузка на одну фазу. */
export const PhaseLoadSchema = z.object({
    /** Мощность, W. */
    powerW: z.number().nonnegative(),
    /** Ток, A. */
    currentA: z.number().nonnegative(),
});
/** Нагрузка фазы. */
export type PhaseLoad = z.infer<typeof PhaseLoadSchema>;

/** Модуль щита, размещённый на DIN-рейке. */
export const PanelModuleSchema = z.object({
    /** Тип УГО модуля. */
    kind: NodeKindSchema,
    /** Подпись. */
    label: z.string().min(1),
    /** Число занятых DIN-модулей (18 мм каждый). */
    dinModules: z.number().int().positive(),
    /** Порядковый номер на рейке. */
    panelSlot: z.number().int().positive(),
    /** Идентификатор группы, если модуль относится к линии. */
    groupId: z.string().min(1).nullable(),
});
/** Модуль щита. */
export type PanelModule = z.infer<typeof PanelModuleSchema>;

/** Ответ автосборки щита. */
export const AutoPanelResponseSchema = z.object({
    /** Сгруппированные линии. */
    groups: z.array(PanelGroupSchema),
    /** Нагрузки по фазам. */
    phaseLoads: z.object({
        L1: PhaseLoadSchema,
        L2: PhaseLoadSchema,
        L3: PhaseLoadSchema,
    }),
    /** Перекос фаз, %. */
    imbalancePercent: z.number().nonnegative(),
    /** Модули на DIN-рейке. */
    modules: z.array(PanelModuleSchema),
    /** Занято модулей без резерва. */
    usedDinModules: z.number().int().nonnegative(),
    /** Требуемый корпус с +20% резерва, модулей. */
    enclosureModules: z.number().int().nonnegative(),
    /** Предупреждения. */
    warnings: z.array(z.string().min(1)),
    /** Идентификаторы пунктов ПУЭ. */
    references: z.array(z.string().min(1)),
    /** Версия справочника правил. */
    rulesVersion: z.string().min(1),
});
/** Ответ автосборки щита. */
export type AutoPanelResponse = z.infer<typeof AutoPanelResponseSchema>;

/** Критичность нарушения ПУЭ-7. */
export const PueSeveritySchema = z.enum(['error', 'warning', 'info']);
/** Критичность. */
export type PueSeverity = z.infer<typeof PueSeveritySchema>;

/** Находка аудита ПУЭ-7 с ссылкой на пункт справочника. */
export const PueFindingSchema = z.object({
    /** Идентификатор находки. */
    id: z.string().min(1),
    /** Критичность. */
    severity: PueSeveritySchema,
    /** Идентификатор пункта из `PUE_RULES_V02.md` (начинается с `PUE-`). */
    ruleId: z.string().regex(/^PUE-[A-Z0-9.-]+$/),
    /** Раздел норматива. */
    section: z.string().min(1),
    /** Описание на русском языке. */
    message: z.string().min(1),
    /** Узлы графа, к которым относится находка. */
    nodeIds: z.array(UuidSchema),
    /** Рекомендация по устранению. */
    recommendation: z.string().min(1),
});
/** Находка аудита. */
export type PueFinding = z.infer<typeof PueFindingSchema>;

/** Цитата из норматива, найденная в `normative_chunks`. */
export const PueCitationSchema = z.object({
    /** Идентификатор пункта. */
    ruleId: z.string().min(1),
    /** Выдержка. */
    excerpt: z.string().min(1),
    /** Источник, например `PUE-7`. */
    document: z.string().min(1),
});
/** Цитата норматива. */
export type PueCitation = z.infer<typeof PueCitationSchema>;

/** Структурированный отчёт аудита ПУЭ-7. */
export const PueAuditReportSchema = z.object({
    /** Идентификатор проекта. */
    projectId: UuidSchema,
    /** Находки. */
    findings: z.array(PueFindingSchema),
    /** Сводка по критичности. */
    summary: z.object({
        errors: z.number().int().nonnegative(),
        warnings: z.number().int().nonnegative(),
        info: z.number().int().nonnegative(),
    }),
    /** Цитаты из справочника. */
    citations: z.array(PueCitationSchema),
    /** Версия справочника. */
    rulesVersion: z.string().min(1),
    /** Объяснение агента на русском языке. */
    explanation: z.string().min(1),
});
/** Отчёт аудита ПУЭ-7. */
export type PueAuditReport = z.infer<typeof PueAuditReportSchema>;

/** Запрос расчёта однофазного тока КЗ «фаза-ноль». */
export const ShortCircuitRequestSchema = z.object({
    /** Мощность трансформатора, kVA. */
    transformerPowerKva: z.number().positive(),
    /** Напряжение короткого замыкания трансформатора, %. */
    transformerUkPercent: z.number().positive().max(100).optional(),
    /** Фазное напряжение, V. */
    voltageV: SupplyVoltageSchema.optional(),
    /** Длина линии, m. */
    cableLengthM: z.number().positive(),
    /** Сечение жилы, mm2. */
    crossSectionMm2: CrossSectionSchema,
    /** Номинал группового автомата, A. */
    breakerRatingA: z.number().positive(),
    /** Кривая срабатывания. */
    tripCurve: z.enum(['B', 'C', 'D']).optional(),
    /** Номинал вводного автомата, A. */
    upstreamBreakerRatingA: z.number().positive().optional(),
    /** Кривая вводного автомата. */
    upstreamTripCurve: z.enum(['B', 'C', 'D']).optional(),
});
/** Запрос расчёта КЗ. */
export type ShortCircuitRequest = z.infer<typeof ShortCircuitRequestSchema>;

/** Ответ расчёта однофазного КЗ и селективности. */
export const ShortCircuitResponseSchema = z.object({
    /** Сопротивление трансформатора, Ohm. */
    transformerImpedanceOhm: z.number().positive(),
    /** Сопротивление фазной жилы, Ohm. */
    phaseResistanceOhm: z.number().positive(),
    /** Сопротивление нулевой жилы, Ohm. */
    neutralResistanceOhm: z.number().positive(),
    /** Индуктивное сопротивление петли, Ohm. */
    loopReactanceOhm: z.number().nonnegative(),
    /** Полное сопротивление петли, Ohm. */
    loopImpedanceOhm: z.number().positive(),
    /** Минимальный ток однофазного КЗ, A. */
    shortCircuitCurrentA: z.number().positive(),
    /** Кратность гарантированного отключения. */
    requiredMultiplicity: z.number().positive(),
    /** Нижняя граница зоны срабатывания. */
    minimumMultiplicity: z.number().positive(),
    /** Фактическая кратность. */
    actualMultiplicity: z.number().nonnegative(),
    /** Ток мгновенного срабатывания, A. */
    instantaneousTripA: z.number().positive(),
    /** Мгновенное отключение гарантировано. */
    disconnectComplies: z.boolean(),
    /** Селективность соблюдена. */
    selectivityOk: z.boolean(),
    /** Отношение вводного к групповому номиналу. */
    upstreamToDownstreamRatio: z.number().nonnegative(),
    /** Оценка времени отключения, s. */
    tripTimeS: z.number().nonnegative(),
    /** Предупреждения. */
    warnings: z.array(z.string()),
    /** Ссылки на пункты ПУЭ. */
    references: z.array(z.string().min(1)),
    /** Версия справочника. */
    rulesVersion: z.string().min(1),
});
/** Ответ расчёта КЗ. */
export type ShortCircuitResponse = z.infer<typeof ShortCircuitResponseSchema>;

/** Сообщение истории переписки с копилотом. */
export const CopilotChatMessageSchema = z.object({
    /** Роль отправителя. */
    role: z.enum(['user', 'assistant']),
    /** Текст сообщения. */
    content: z.string().min(1),
});
/** Сообщение чата. */
export type CopilotChatMessage = z.infer<typeof CopilotChatMessageSchema>;

/** Запрос к ИИ-копилоту проекта. */
export const CopilotChatRequestSchema = z.object({
    /** Сообщение пользователя на естественном языке. */
    message: z.string().min(1).max(4000),
    /** Предыдущие сообщения. */
    history: z.array(CopilotChatMessageSchema).max(50).optional(),
    /** Предпочтительный бренд оборудования. */
    preferredBrand: z.enum(['IEK', 'EKF', 'КЭАЗ']).optional(),
});
/** Запрос чата. */
export type CopilotChatRequest = z.infer<typeof CopilotChatRequestSchema>;

/** Вызов инструмента, зафиксированный в ответе копилота. */
export const CopilotToolCallSchema = z.object({
    /** Имя инструмента. */
    tool: z.string().min(1),
    /** Краткое описание результата. */
    summary: z.string().min(1),
});
/** Вызов инструмента копилотом. */
export type CopilotToolCall = z.infer<typeof CopilotToolCallSchema>;

/**
 * Ответ ИИ-копилота: предложение патча графа без записи в БД.
 * Применение выполняется отдельным запросом `PUT /projects/:id/graph`.
 */
export const CopilotChatResponseSchema = z.object({
    /** Пояснение на русском языке. */
    reply: z.string().min(1),
    /** Предлагаемый граф; отсутствует, если изменений нет. */
    proposedGraph: ProjectGraphSchema.optional(),
    /** Человекочитаемые изменения. */
    diffSummary: z.array(z.string().min(1)),
    /** Инструменты, вызванные для получения чисел. */
    toolCalls: z.array(CopilotToolCallSchema),
    /** Ссылки на пункты нормативов. */
    citations: z.array(z.string().min(1)).optional(),
});
/** Ответ чата. */
export type CopilotChatResponse = z.infer<typeof CopilotChatResponseSchema>;
