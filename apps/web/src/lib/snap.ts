// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Магнитное прилипание ЭУИ к стенам импортированного DXF (DESIGN v0.3 § 3.4). */
import type { Point, Wall } from '@voltwirecraft/shared/graph.schema.js';
import type { ScreenPoint } from './geometry.js';
import { effectiveScale, metersToPx, pxToMeters } from './geometry.js';

/** Расстояние прилипания по умолчанию, м. */
export const DEFAULT_SNAP_DISTANCE_M = 0.2;

/**
 * Ближайшая точка на отрезке.
 * @param point Исходная точка.
 * @param start Начало отрезка.
 * @param end Конец отрезка.
 * @returns Проекция точки на отрезок.
 */
function closestPointOnSegment(point: Point, start: Point, end: Point): Point {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
        return start;
    }
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return { x: start.x + t * dx, y: start.y + t * dy };
}

/**
 * Привязать точку к ближайшей стене в пределах порога.
 * @param pointPx Точка в пикселях подложки.
 * @param walls Стены графа (координаты в метрах).
 * @param scaleMetersPerPx Масштаб плана.
 * @param thresholdM Порог прилипания в метрах.
 * @returns Привязанная точка в пикселях подложки.
 */
export function snapToWalls(
    pointPx: ScreenPoint,
    walls: readonly Wall[],
    scaleMetersPerPx: number | null,
    thresholdM = DEFAULT_SNAP_DISTANCE_M,
): ScreenPoint {
    const scale = effectiveScale(scaleMetersPerPx);
    const pointM = pxToMeters(pointPx, scale);
    let best: Point | null = null;
    let bestDistance = thresholdM;

    for (const wall of walls) {
        for (let index = 0; index < wall.path.length - 1; index += 1) {
            const start = wall.path[index];
            const end = wall.path[index + 1];
            if (start === undefined || end === undefined) {
                continue;
            }
            const candidate = closestPointOnSegment(pointM, start, end);
            const distance = Math.hypot(candidate.x - pointM.x, candidate.y - pointM.y);
            if (distance <= bestDistance) {
                bestDistance = distance;
                best = candidate;
            }
        }
    }

    return best === null ? pointPx : metersToPx(best, scale);
}
