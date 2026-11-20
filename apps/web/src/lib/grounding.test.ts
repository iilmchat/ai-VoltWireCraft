// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
import { describe, expect, it } from 'vitest';
import { calculateGrounding, GroundingResponseSchema, type GroundingInput } from './grounding.js';

/** Базовый корректный набор параметров расчёта. */
const BASE: GroundingInput = {
    soil: 'loam',
    electrodeLengthM: 3,
    electrodeCount: 2,
    stripLengthM: 5,
    mastHeightM: 10,
};

describe('расчёт заземления и молниезащиты', () => {
    it('даёт детерминированный результат для одинаковых входных данных', () => {
        expect(calculateGrounding(BASE)).toEqual(calculateGrounding(BASE));
    });

    it('глина обеспечивает меньшее сопротивление, чем песок', () => {
        const clay = calculateGrounding({ ...BASE, soil: 'clay' });
        const sand = calculateGrounding({ ...BASE, soil: 'sand' });
        expect(clay.resistanceOhm).toBeLessThan(sand.resistanceOhm);
    });

    it('увеличение числа электродов снижает сопротивление', () => {
        const two = calculateGrounding(BASE);
        const four = calculateGrounding({ ...BASE, electrodeCount: 4 });
        expect(four.resistanceOhm).toBeLessThan(two.resistanceOhm);
    });

    it('увеличение высоты мачты увеличивает радиус зоны защиты', () => {
        const low = calculateGrounding(BASE);
        const high = calculateGrounding({ ...BASE, mastHeightM: 20 });
        expect(high.zoneRadiusM).toBeGreaterThan(low.zoneRadiusM);
        expect(high.zoneRadiusM).toBeCloseTo(30);
    });

    it('не выбрасывает исключение на некорректных данных и возвращает конечные числа', () => {
        const invalid: GroundingInput = {
            soil: 'clay',
            electrodeLengthM: 0,
            electrodeCount: -1,
            stripLengthM: Number.NaN,
            mastHeightM: Number.POSITIVE_INFINITY,
        };
        expect(() => calculateGrounding(invalid)).not.toThrow();
        const result = calculateGrounding(invalid);
        expect(Number.isFinite(result.resistanceOhm)).toBe(true);
        expect(Number.isFinite(result.zoneRadiusM)).toBe(true);
        expect(result.references).toEqual(['ПУЭ-7 гл. 1.7', 'ГОСТ Р 50571.5.54']);
    });

    it('схема ответа разбирает результат расчёта', () => {
        const result = calculateGrounding(BASE);
        expect(GroundingResponseSchema.parse(result)).toEqual(result);
    });
});
