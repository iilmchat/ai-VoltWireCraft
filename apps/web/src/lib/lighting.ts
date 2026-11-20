// © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
/**
 * Светотехнический расчёт по СП 52.13330.2016 (детерминированный предпросмотр).
 * RULES § 5.1:_numbers_ приходят из формул, а не из LLM; серверный калькулятор
 * при появлении	endpoint подменяет локальный результат.
 */
import type { Point, RoomZone, RoomZoneType } from '@voltwirecraft/shared/graph.schema.js';
import { z } from 'zod';

/** Параметры расчёта освещённости комнаты. */
export interface LightingRequest {
    /** Вершины полигона зоны, м. */
    polygonM: readonly Point[];
    /** Высота потолка, м. */
    ceilingHeightM: number;
    /** Тип помещения. */
    roomType: RoomZoneType;
    /** Световой поток одного светильника, лм. */
    lumenPerFixture: number;
    /** Коэффициент запаса; по умолчанию 1,3. */
    safetyFactor?: number;
    /** Нормативная освещённость, лк; по умолчанию зависит от типа помещения. */
    targetLux?: number;
}

/** Результат светотехнического расчёта. */
export interface LightingResult {
    /** Площадь зоны, м². */
    areaM2: number;
    /** Индекс помещения. */
    roomIndex: number;
    /** Коэффициент использования светового потока. */
    utilizationFactor: number;
    /** Требуемый суммарный световой поток, лм. */
    requiredLumens: number;
    /** Рекомендуемое число светильников. */
    fixtureCount: number;
    /** Нормативная освещённость, лк. */
    targetLux: number;
    /** Нормативные ссылки. */
    references: readonly string[];
}

/** Zod-контракт ответа серверного расчёта освещённости. */
export const LightingResponseSchema = z.object({
    /** Площадь зоны, м². */
    areaM2: z.number().nonnegative(),
    /** Индекс помещения. */
    roomIndex: z.number().nonnegative(),
    /** Коэффициент использования. */
    utilizationFactor: z.number().positive(),
    /** Требуемый световой поток, лм. */
    requiredLumens: z.number().nonnegative(),
    /** Число светильников. */
    fixtureCount: z.number().int().nonnegative(),
    /** Нормативная освещённость, лк. */
    targetLux: z.number().positive().optional(),
    /** Нормативные ссылки. */
    references: z.array(z.string().min(1)).optional(),
});
/** Ответ расчёта освещённости. */
export type LightingResponse = z.infer<typeof LightingResponseSchema>;

/** Нормативная освещённость по типу помещения, лк (СП 52.13330.2016). */
const TARGET_LUX: Readonly<Record<RoomZoneType, number>> = {
    living: 150,
    wet: 200,
    kitchen: 200,
    outdoor: 100,
    utility: 100,
};

/** Базовый коэффициент использования по типу помещения. */
const BASE_UTILIZATION: Readonly<Record<RoomZoneType, number>> = {
    living: 0.58,
    wet: 0.5,
    kitchen: 0.52,
    outdoor: 0.45,
    utility: 0.55,
};

/**
 * Площадь многоугольника по формуле шнурования (Гаусса).
 * @param polygon Вершины полигона, м.
 * @returns Площадь, м² (неотрицательная).
 */
export function polygonAreaM2(polygon: readonly Point[]): number {
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
 * Ограничить число безопасным конечным значением.
 * @param value Проверяемое число.
 * @param fallback Значение по умолчанию.
 * @returns Конечное положительное число.
 */
function safePositive(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Рассчитать число светильников и параметры освещения комнаты.
 * @param request Параметры расчёта.
 * @returns Детерминированный результат.
 */
export function calculateLighting(request: LightingRequest): LightingResult {
    const area = polygonAreaM2(request.polygonM);
    const xs = request.polygonM.map((point) => point.x);
    const ys = request.polygonM.map((point) => point.y);
    const width = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0;
    const height = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0;
    const ceiling = safePositive(request.ceilingHeightM, 2.7);
    const targetLux = safePositive(request.targetLux, TARGET_LUX[request.roomType]);
    const safetyFactor = safePositive(request.safetyFactor, 1.3);
    const lumens = safePositive(request.lumenPerFixture, 1200);

    const roomIndex = area > 0 && width > 0 && height > 0
        ? area / (ceiling * (width + height))
        : 0;
    const utilizationFactor = Math.min(
        0.85,
        Math.max(0.3, BASE_UTILIZATION[request.roomType] + Math.min(roomIndex, 8) * 0.02),
    );
    const requiredLumens = area > 0
        ? (targetLux * area * safetyFactor) / utilizationFactor
        : 0;
    const fixtureCount = requiredLumens > 0 ? Math.max(1, Math.ceil(requiredLumens / lumens)) : 0;

    return {
        areaM2: area,
        roomIndex,
        utilizationFactor,
        requiredLumens,
        fixtureCount,
        targetLux,
        references: ['СП 52.13330.2016'],
    };
}

/**
 * Проверить, что точка лежит внутри полигона (лучевой метод).
 * @param point Точка, м.
 * @param polygon Вершины полигона, м.
 * @returns true, если точка внутри.
 */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
        const current = polygon[index];
        const prior = polygon[previous];
        if (current === undefined || prior === undefined) {
            continue;
        }
        const intersects =
            current.y > point.y !== prior.y > point.y &&
            point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y || Number.EPSILON) + current.x;
        if (intersects) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Равномерная сетка точек внутри зоны.
 * @param room Зона помещения.
 * @param count Требуемое число светильников.
 * @returns Координаты точек в метрах.
 */
export function fixturePositions(room: RoomZone, count: number): readonly Point[] {
    if (count <= 0 || room.polygon.length < 3) {
        return [];
    }
    const xs = room.polygon.map((point) => point.x);
    const ys = room.polygon.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / columns));
    const positions: Point[] = [];
    for (let row = 0; row < rows && positions.length < count; row += 1) {
        for (let column = 0; column < columns && positions.length < count; column += 1) {
            const x = minX + ((column + 0.5) / columns) * (maxX - minX);
            const y = minY + ((row + 0.5) / rows) * (maxY - minY);
            const point = { x, y };
            if (pointInPolygon(point, room.polygon)) {
                positions.push(point);
            }
        }
    }
    // Если сетка не дала нужное число (вогнутый полигон), добавляем центроид.
    while (positions.length < count) {
        const centroid = {
            x: xs.reduce((sum, value) => sum + value, 0) / xs.length,
            y: ys.reduce((sum, value) => sum + value, 0) / ys.length,
        };
        positions.push(centroid);
    }
    return positions;
}
