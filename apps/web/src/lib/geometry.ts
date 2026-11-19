// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import type { Point } from '@voltwirecraft/shared';

/** Точка в пикселях холста/подложки. */
export interface ScreenPoint {
    /** Горизонтальная координата. */
    x: number;
    /** Вертикальная координата. */
    y: number;
}

/** Параметры просмотра холста. */
export interface Viewport {
    /** Смещение по X. */
    x: number;
    /** Смещение по Y. */
    y: number;
    /** Масштаб отображения. */
    scale: number;
}

/** Масштаб по умолчанию до калибровки: 1 пикс = 1 мм. */
export const DEFAULT_SCALE_METERS_PER_PX = 0.001;

/** Минимальный zoom холста. */
export const MIN_ZOOM = 0.05;

/** Максимальный zoom холста. */
export const MAX_ZOOM = 20;

/**
 * Получить масштаб метры/пикс с учётом значения по умолчанию.
 * @param scaleMetersPerPx Масштаб из графа (может быть null).
 * @returns Числовой масштаб больше нуля.
 */
export function effectiveScale(scaleMetersPerPx: number | null): number {
    return scaleMetersPerPx !== null && scaleMetersPerPx > 0
        ? scaleMetersPerPx
        : DEFAULT_SCALE_METERS_PER_PX;
}

/**
 * Перевести пиксели подложки в метры графа (СИ, RULES § 5.3).
 * @param point Точка в пикселях.
 * @param scaleMetersPerPx Масштаб метры/пикс.
 * @returns Точка в метрах.
 */
export function pxToMeters(point: ScreenPoint, scaleMetersPerPx: number | null): Point {
    const scale = effectiveScale(scaleMetersPerPx);
    return { x: point.x * scale, y: point.y * scale };
}

/**
 * Перевести метры графа в пиксели подложки.
 * @param point Точка в метрах.
 * @param scaleMetersPerPx Масштаб метры/пикс.
 * @returns Точка в пикселях.
 */
export function metersToPx(point: Point, scaleMetersPerPx: number | null): ScreenPoint {
    const scale = effectiveScale(scaleMetersPerPx);
    return { x: point.x / scale, y: point.y / scale };
}

/**
 * Расстояние между точками.
 * @param a Первая точка.
 * @param b Вторая точка.
 * @returns Евклидово расстояние.
 */
export function distance(a: ScreenPoint, b: ScreenPoint): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Ограничить число диапазоном.
 * @param value Исходное значение.
 * @param min Нижняя граница.
 * @param max Верхняя граница.
 * @returns Ограниченное значение.
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Перевести экранную точку в координаты холста с учётом zoom/pan.
 * @param point Экранная точка.
 * @param viewport Параметры просмотра.
 * @returns Точка в координатах холста.
 */
export function screenToWorld(point: ScreenPoint, viewport: Viewport): ScreenPoint {
    return {
        x: (point.x - viewport.x) / viewport.scale,
        y: (point.y - viewport.y) / viewport.scale,
    };
}

/**
 * Перевести точку холста в экранную с учётом zoom/pan.
 * @param point Точка холста.
 * @param viewport Параметры просмотра.
 * @returns Экранная точка.
 */
export function worldToScreen(point: ScreenPoint, viewport: Viewport): ScreenPoint {
    return {
        x: point.x * viewport.scale + viewport.x,
        y: point.y * viewport.scale + viewport.y,
    };
}

/**
 * Масштабировать холст относительно указателя.
 * @param viewport Текущие параметры просмотра.
 * @param pointer Экранная позиция указателя.
 * @param factor Множитель масштаба.
 * @returns Новые параметры просмотра.
 */
export function zoomAtPoint(viewport: Viewport, pointer: ScreenPoint, factor: number): Viewport {
    const nextScale = clamp(viewport.scale * factor, MIN_ZOOM, MAX_ZOOM);
    const ratio = nextScale / viewport.scale;
    return {
        scale: nextScale,
        x: pointer.x - (pointer.x - viewport.x) * ratio,
        y: pointer.y - (pointer.y - viewport.y) * ratio,
    };
}

/**
 * Площадь полигона (по формуле шнуровки).
 * @param polygon Вершины полигона.
 * @returns Модуль площади в квадратах координат.
 */
export function polygonArea(polygon: readonly ScreenPoint[]): number {
    if (polygon.length < 3) {
        return 0;
    }
    let twiceArea = 0;
    for (let index = 0; index < polygon.length; index += 1) {
        const current = polygon[index];
        const next = polygon[(index + 1) % polygon.length];
        if (current === undefined || next === undefined) {
            continue;
        }
        twiceArea += current.x * next.y - next.x * current.y;
    }
    return Math.abs(twiceArea) / 2;
}

/**
 * Центроид полигона (для подписи помещения).
 * @param polygon Вершины полигона.
 * @returns Centroид или первая вершина для вырожденного случая.
 */
export function polygonCentroid(polygon: readonly ScreenPoint[]): ScreenPoint {
    const first = polygon[0];
    if (first === undefined) {
        return { x: 0, y: 0 };
    }
    const area = polygonArea(polygon);
    if (area === 0) {
        return { x: first.x, y: first.y };
    }
    let x = 0;
    let y = 0;
    let twiceArea = 0;
    for (let index = 0; index < polygon.length; index += 1) {
        const current = polygon[index];
        const next = polygon[(index + 1) % polygon.length];
        if (current === undefined || next === undefined) {
            continue;
        }
        const cross = current.x * next.y - next.x * current.y;
        twiceArea += cross;
        x += (current.x + next.x) * cross;
        y += (current.y + next.y) * cross;
    }
    return { x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
}

/**
 * Проверить, что контур пригоден для помещения.
 * @param polygon Вершины контура в пикселях.
 * @returns true, если вершин не меньше трёх и площадь значима.
 */
export function isValidPolygon(polygon: readonly ScreenPoint[]): boolean {
    return polygon.length >= 3 && polygonArea(polygon) > 100;
}

/**
 * Сплавить массив точек в плоский массив чисел для Konva.Line.
 * @param points Вершины.
 * @returns Плоский массив [x1, y1, x2, y2, ...].
 */
export function flattenPoints(points: readonly ScreenPoint[]): number[] {
    return points.flatMap((point) => [point.x, point.y]);
}
