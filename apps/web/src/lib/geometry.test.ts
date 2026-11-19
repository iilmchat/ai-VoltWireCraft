// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SCALE_METERS_PER_PX,
    distance,
    effectiveScale,
    flattenPoints,
    isValidPolygon,
    metersToPx,
    polygonArea,
    polygonCentroid,
    pxToMeters,
    screenToWorld,
    worldToScreen,
    zoomAtPoint,
} from './geometry.js';

describe('geometry', () => {
    it('конвертирует метры и пиксели в обе стороны', () => {
        expect(pxToMeters({ x: 100, y: 200 }, 0.002)).toEqual({ x: 0.2, y: 0.4 });
        expect(metersToPx({ x: 0.2, y: 0.4 }, 0.002)).toEqual({ x: 100, y: 200 });
    });

    it('использует масштаб по умолчанию до калибровки', () => {
        expect(effectiveScale(null)).toBe(DEFAULT_SCALE_METERS_PER_PX);
        expect(effectiveScale(0)).toBe(DEFAULT_SCALE_METERS_PER_PX);
        expect(effectiveScale(0.005)).toBe(0.005);
    });

    it('считает расстояние между точками', () => {
        expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });

    it('сохраняет точку под курсором при зуме', () => {
        const viewport = { x: 10, y: 20, scale: 1 };
        const pointer = { x: 100, y: 100 };
        const before = screenToWorld(pointer, viewport);
        const after = zoomAtPoint(viewport, pointer, 2);
        const worldAfter = screenToWorld(pointer, after);
        expect(worldAfter.x).toBeCloseTo(before.x, 6);
        expect(worldAfter.y).toBeCloseTo(before.y, 6);
    });

    it('ограничивает масштаб зуома', () => {
        const viewport = { x: 0, y: 0, scale: 1 };
        const pointer = { x: 0, y: 0 };
        expect(zoomAtPoint(viewport, pointer, 1000).scale).toBe(20);
        expect(zoomAtPoint(viewport, pointer, 0.0001).scale).toBe(0.05);
    });

    it('преобразует экранные координаты туда и обратно', () => {
        const viewport = { x: 40, y: -10, scale: 2.5 };
        const world = screenToWorld({ x: 140, y: 90 }, viewport);
        expect(world).toEqual({ x: 40, y: 40 });
        expect(worldToScreen(world, viewport)).toEqual({ x: 140, y: 90 });
    });

    it('вычисляет площадь и центроид прямоугольника', () => {
        const polygon = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 20 },
            { x: 0, y: 20 },
        ];
        expect(polygonArea(polygon)).toBe(200);
        expect(polygonCentroid(polygon)).toEqual({ x: 5, y: 10 });
        expect(isValidPolygon(polygon)).toBe(true);
    });

    it('отвергает вырожденный контур', () => {
        expect(isValidPolygon([
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 2 },
        ])).toBe(false);
        expect(isValidPolygon([
            { x: 0, y: 0 },
            { x: 1, y: 1 },
        ])).toBe(false);
    });

    it('сплавляет точки в плоский массив', () => {
        expect(flattenPoints([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toEqual([1, 2, 3, 4]);
    });
});
