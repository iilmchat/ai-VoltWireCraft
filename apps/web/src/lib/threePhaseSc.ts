// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/**
 * Детерминированный предпросмотр трёхфазного КЗ и ударного тока
 * (DESIGN_V090 §2.2). RULES §5.1: итоговые числа приходят из calc-engine;
 * локальная формула используется только при недоступности сервера.
 */
import { z } from 'zod';

/** Параметры расчёта трёхфазного КЗ. */
export interface ThreePhaseScInput {
    /** Межлинейное напряжение, В. */
    lineVoltageV: number;
    /** Полное сопротивление петли, Ом. */
    loopImpedanceOhm: number;
    /** Коэффициент ударного тока; по умолчанию 1,8. */
    peakFactor?: number;
    /** Отключающая способность вводного аппарата, кА. */
    breakingCapacityKa?: number;
}

/** Результат расчёта трёхфазного КЗ. */
export interface ThreePhaseScResult {
    /** Ток трёхфазного КЗ, А. */
    shortCircuitCurrentA: number;
    /** Ударный ток, А. */
    peakCurrentA: number;
    /** Применённый коэффициент ударного тока. */
    peakFactor: number;
    /** Достаточна ли отключающая способность. */
    breakingCapacityOk: boolean;
    /** Нормативные ссылки. */
    references: readonly string[];
}

/** Zod-контракт ответа сервера трёхфазного КЗ. */
export const ThreePhaseScResponseSchema = z.object({
    /** Ток трёхфазного КЗ, А. */
    shortCircuitCurrentA: z.number().positive(),
    /** Ударный ток, А. */
    peakCurrentA: z.number().positive(),
    /** Коэффициент ударного тока. */
    peakFactor: z.number().positive().optional(),
    /** Отключающая способность достаточна. */
    breakingCapacityOk: z.boolean().optional(),
    /** Нормативные ссылки. */
    references: z.array(z.string().min(1)).optional(),
});
/** Ответ сервера трёхфазного КЗ. */
export type ThreePhaseScResponse = z.infer<typeof ThreePhaseScResponseSchema>;

/**
 * Рассчитать трёхфазный ток КЗ и ударный ток.
 * @param input Параметры расчёта.
 * @returns Детерминированный результат.
 */
export function calculateThreePhaseSc(input: ThreePhaseScInput): ThreePhaseScResult {
    const voltage = Number.isFinite(input.lineVoltageV) && input.lineVoltageV > 0
        ? input.lineVoltageV
        : 400;
    const impedance = Number.isFinite(input.loopImpedanceOhm) && input.loopImpedanceOhm > 0
        ? input.loopImpedanceOhm
        : 1;
    const peakFactor = Number.isFinite(input.peakFactor) && input.peakFactor !== undefined && input.peakFactor > 0
        ? input.peakFactor
        : 1.8;
    const shortCircuitCurrentA = voltage / (Math.sqrt(3) * impedance);
    const peakCurrentA = peakFactor * Math.SQRT2 * shortCircuitCurrentA;
    const breakingCapacityOk = input.breakingCapacityKa === undefined
        ? false
        : input.breakingCapacityKa * 1000 >= shortCircuitCurrentA;
    return {
        shortCircuitCurrentA,
        peakCurrentA,
        peakFactor,
        breakingCapacityOk,
        references: ['ПУЭ-7 гл. 1.7', 'ГОСТ Р 50571.2'],
    };
}
