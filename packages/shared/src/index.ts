// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { z } from 'zod';
import { ProjectGraphSchema as BackendProjectGraphSchema } from './graph.js';
import type { ProjectGraph as BackendProjectGraph } from './graph.js';

// Контракты расчётного ядра и серверный граф реэкспортируются под другими
// именами, чтобы не конфликтовать с ProjectGraphSchema клиентского графа (.vwc).
export {
    CableLengthRequestSchema,
    CableLengthResponseSchema,
    CablePointSchema,
} from './cable.js';
export type {
    CableLengthRequest,
    CableLengthResponse,
    CablePoint,
} from './cable.js';
export { BackendProjectGraphSchema };
export type { BackendProjectGraph };
export {
    NodeKindSchema,
    Point3DSchema,
    GraphNodeSchema,
    CableSchema,
    GraphEdgeSchema,
} from './graph.js';
export type {
    NodeKind,
    Point3D,
    GraphNode,
    Cable,
    GraphEdge,
} from './graph.js';

/**
 * Разобрать серверный граф проекта (контракт расчётного ядра).
 * @param value Внешние данные под валидацию Zod.
 * @returns Валидированный граф узлов и связей.
 * @throws При несоответствии схеме.
 */
export function parseProjectGraph(value: unknown): BackendProjectGraph {
    return BackendProjectGraphSchema.parse(value);
}

/**
 * Точка на плоскости. Координаты задаются в метрах (СИ, RULES § 5.3).
 */
export const PointSchema = z.object({
    x: z.number().finite(),
    y: z.number().finite(),
});

/** Выводимый тип точки на плоскости. */
export type Point = z.infer<typeof PointSchema>;

/**
 * Идентификатор сущности графа — UUID версии 1–5.
 */
export const UuidSchema = z
    .string()
    .refine(
        (v) => /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(v),
        'invalid uuid',
    );

/** Выводимый тип идентификатора сущности графа. */
export type Uuid = z.infer<typeof UuidSchema>;

/**
 * Вид электрического устройства (ЭУИ).
 */
export const DeviceKindSchema = z.enum(['panel', 'socket', 'switch', 'light_fixture', 'appliance']);

/** Выводимый тип вида электрического устройства. */
export type DeviceKind = z.infer<typeof DeviceKindSchema>;

/**
 * Тип помещения.
 */
export const RoomTypeSchema = z.enum(['living', 'wet', 'kitchen', 'outdoor', 'utility']);

/** Выводимый тип помещения. */
export type RoomType = z.infer<typeof RoomTypeSchema>;

/**
 * Формат файла подложки плана.
 */
export const BackgroundKindSchema = z.enum(['png', 'jpg', 'pdf']);

/** Выводимый тип формата подложки плана. */
export type BackgroundKind = z.infer<typeof BackgroundKindSchema>;

/**
 * Подложка плана этажа.
 *
 * `dataUrl` — data URL отрендеренного растрового изображения
 * (для PDF — отрендеренная выбранная страница в высоком разрешении).
 */
export const BackgroundSchema = z.object({
    kind: BackgroundKindSchema,
    name: z.string().min(1),
    pageNumber: z.number().int().positive().nullable(),
    widthPx: z.number().positive(),
    heightPx: z.number().positive(),
    dataUrl: z.string().min(1),
});

/** Выводимый тип подложки плана этажа. */
export type Background = z.infer<typeof BackgroundSchema>;

/**
 * Параметры плана этажа.
 *
 * `scaleMetersPerPx` — метров на пиксель подложки; `null`, пока масштаб не откалиброван.
 */
export const FloorPlanSchema = z.object({
    background: BackgroundSchema.nullable(),
    scaleMetersPerPx: z.number().positive().nullable(),
});

/** Выводимый тип параметров плана этажа. */
export type FloorPlan = z.infer<typeof FloorPlanSchema>;

/**
 * Зона помещения на плане.
 *
 * Вершины `polygon` задаются в метрах (СИ); перевод из пикселей холста
 * выполняется через `scaleMetersPerPx`.
 */
export const RoomZoneSchema = z.object({
    id: UuidSchema,
    name: z.string().min(1),
    type: RoomTypeSchema,
    polygon: z.array(PointSchema).min(3),
});

/** Выводимый тип зоны помещения. */
export type RoomZone = z.infer<typeof RoomZoneSchema>;

/**
 * Электрическое устройство (ЭУИ) на плане.
 *
 * `position` — координаты в метрах; `powerW` — мощность в ваттах;
 * `mountingHeightM` — высота установки в метрах от пола;
 * `ugo` — УГО (условное графическое обозначение) либо название.
 */
export const ElectricalDeviceSchema = z.object({
    id: UuidSchema,
    kind: DeviceKindSchema,
    ugo: z.string().min(1),
    position: PointSchema,
    powerW: z.number().nonnegative(),
    mountingHeightM: z.number().nonnegative(),
    roomId: UuidSchema.nullable(),
});

/** Выводимый тип электрического устройства. */
export type ElectricalDevice = z.infer<typeof ElectricalDeviceSchema>;

/**
 * Стена, перегородка или проём на плане.
 */
export const WallSchema = z.object({
    id: UuidSchema,
    kind: z.enum(['wall', 'partition', 'doorway', 'window']),
    path: z.array(PointSchema).min(2),
    thickness: z.number().nonnegative(),
});

/** Выводимый тип стены, перегородки или проёма. */
export type Wall = z.infer<typeof WallSchema>;

/**
 * Кабельная трасса.
 */
export const CableRouteSchema = z.object({
    id: UuidSchema,
    path: z.array(PointSchema).min(2),
    crossSection: z.number().positive(),
});

/** Выводимый тип кабельной трассы. */
export type CableRoute = z.infer<typeof CableRouteSchema>;

/**
 * Граф проекта — единый источник истины для плана и схемы (RULES § 5.2).
 */
export const ProjectGraphSchema = z.object({
    schemaVersion: z.literal(1),
    id: UuidSchema,
    name: z.string().min(1),
    floorPlan: FloorPlanSchema,
    rooms: z.array(RoomZoneSchema),
    walls: z.array(WallSchema),
    devices: z.array(ElectricalDeviceSchema),
    routes: z.array(CableRouteSchema),
});

/** Выводимый тип графа проекта. */
export type ProjectGraph = z.infer<typeof ProjectGraphSchema>;

/**
 * Файл проекта `.vwc`.
 */
export const VwcFileSchema = z.object({
    format: z.literal('vwc-project'),
    schemaVersion: z.literal(1),
    graph: ProjectGraphSchema,
    savedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'invalid ISO date'),
});

/** Выводимый тип файла проекта `.vwc`. */
export type VwcFile = z.infer<typeof VwcFileSchema>;

/**
 * Создаёт пустой граф проекта.
 * @param name — название проекта; по умолчанию «Новый проект».
 * @returns Граф с версией схемы 1, сгенерированным UUID и пустыми коллекциями.
 */
export function createEmptyProjectGraph(name = 'Новый проект'): ProjectGraph {
    return {
        schemaVersion: 1,
        id: crypto.randomUUID(),
        name,
        floorPlan: { background: null, scaleMetersPerPx: null },
        rooms: [],
        walls: [],
        devices: [],
        routes: [],
    };
}

/**
 * Переводит координаты из метров в пиксели подложки.
 * @param point — точка в метрах.
 * @param scaleMetersPerPx — метров на пиксель подложки.
 * @returns Точка в пикселях подложки.
 */
export function metersToPixels(point: Point, scaleMetersPerPx: number): Point {
    return { x: point.x / scaleMetersPerPx, y: point.y / scaleMetersPerPx };
}

/**
 * Переводит координаты из пикселей подложки в метры.
 * @param point — точка в пикселях подложки.
 * @param scaleMetersPerPx — метров на пиксель подложки.
 * @returns Точка в метрах.
 */
export function pixelsToMeters(point: Point, scaleMetersPerPx: number): Point {
    return { x: point.x * scaleMetersPerPx, y: point.y * scaleMetersPerPx };
}

/**
 * Виды электрических устройств в порядке объявления в `DeviceKindSchema`.
 */
export const DEVICE_KINDS: readonly DeviceKind[] = ['panel', 'socket', 'switch', 'light_fixture', 'appliance'];

/**
 * Типы помещений в порядке объявления в `RoomTypeSchema`.
 */
export const ROOM_TYPES: readonly RoomType[] = ['living', 'wet', 'kitchen', 'outdoor', 'utility'];
