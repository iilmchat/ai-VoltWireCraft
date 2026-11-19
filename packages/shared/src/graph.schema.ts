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
        })
        .optional(),
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
