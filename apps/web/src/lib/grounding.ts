// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/**
 * Детерминированный расчёт заземления и молниезащиты (клиентский предпросмотр).
 * RULES § 5.1: числа вычисляются формулами, без LLM и случайности; серверный
 * калькулятор при появлении endpoint подменяет локальный результат.
 */
import { z } from 'zod';

/** Тип грунта по справочнику расчёта заземления. */
export type SoilKind = 'sand' | 'loam' | 'clay';

/** Параметры расчёта контура заземления и стержневого молниеотвода. */
export interface GroundingInput {
    /** Тип грунта. */
    soil: SoilKind;
    /** Длина одного вертикального электрода, м. */
    electrodeLengthM: number;
    /** Число вертикальных электродов. */
    electrodeCount: number;
    /** Длина горизонтальной полосы, м. */
    stripLengthM: number;
    /** Высота стержневого молниеотвода, м. */
    mastHeightM: number;
}

/** Результат расчёта заземления и зоны молниезащиты. */
export interface GroundingResult {
    /** Суммарное сопротивление контура заземления, Ом. */
    resistanceOhm: number;
    /** Радиус зоны защиты стержневого молниеотвода, м. */
    zoneRadiusM: number;
    /** Соответствие норме (сопротивление не более 4 Ом). */
    ok: boolean;
    /** Нормативные ссылки. */
    references: readonly string[];
}

/** Zod-контракт ответа серверного расчёта заземления. */
export const GroundingResponseSchema = z.object({
    /** Суммарное сопротивление контура заземления, Ом. */
    resistanceOhm: z.number().nonnegative(),
    /** Радиус зоны защиты стержневого молниеотвода, м. */
    zoneRadiusM: z.number().nonnegative(),
    /** Соответствие норме. */
    ok: z.boolean(),
    /** Нормативные ссылки. */
    references: z.array(z.string().min(1)),
});

/** Удельное сопротивление грунта, Ом·м. */
const SOIL_RESISTIVITY: Readonly<Record<SoilKind, number>> = {
    sand: 150,
    loam: 100,
    clay: 60,
};

/** Сезонный коэффициент сопротивления грунта. */
const SEASONAL_FACTOR = 1.2;
/** Диаметр вертикального электрода, м. */
const ELECTRODE_DIAMETER_M = 0.05;
/** Глубина заложения горизонтальной полосы, м. */
const STRIP_DEPTH_M = 0.7;
/** Эквивалентный диаметр полосы, м. */
const STRIP_DIAMETER_M = 0.04;
/** Коэффициент взаимного влияния электродов. */
const MUTUAL_FACTOR = 1.1;
/** Нормативное предела сопротивления, Ом (ПУЭ-7 гл. 1.7). */
const RESISTANCE_LIMIT_OHM = 4;
/** Коэффициент радиуса зоны стержневого молниеотвода. */
const ZONE_RADIUS_FACTOR = 1.5;
/** Нормативные ссылки расчёта. */
const REFERENCES: readonly string[] = ['ПУЭ-7 гл. 1.7', 'ГОСТ Р 50571.5.54'];

/** Безопасная длина вертикального электрода по умолчанию, м. */
const DEFAULT_ELECTRODE_LENGTH_M = 3;
/** Безопасное число электродов по умолчанию. */
const DEFAULT_ELECTRODE_COUNT = 1;
/** Безопасная длина полосы по умолчанию, м. */
const DEFAULT_STRIP_LENGTH_M = 5;
/** Безопасная высота молниеотвода по умолчанию, м. */
const DEFAULT_MAST_HEIGHT_M = 10;
/** Безопасное сопротивление при вычислительной ошибке, Ом. */
const FALLBACK_RESISTANCE_OHM = 10;
/** Безопасный радиус при вычислительной ошибке, м. */
const FALLBACK_ZONE_RADIUS_M = DEFAULT_MAST_HEIGHT_M * ZONE_RADIUS_FACTOR;

/**
 * Вернуть конечное положительное число или значение по умолчанию.
 * @param value Проверяемое число (ноль, отрицание, NaN и бесконечность отбрасываются).
 * @param fallback Безопасное значение по умолчанию.
 * @returns Конечное положительное число.
 */
function safePositive(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Проверить тип грунта, подменив неизвестное значение на суглинок.
 * @param soil Проверяемый тип грунта.
 * @returns Корректный тип грунта.
 */
function safeSoil(soil: SoilKind): SoilKind {
    return soil === 'sand' || soil === 'loam' || soil === 'clay' ? soil : 'loam';
}

/**
 * Вычислить логарифм аргумента, гарантированно больше нуля.
 * @param value Аргумент натурального логарифма.
 * @returns Неотрицательный логарифм.
 */
function positiveLog(value: number): number {
    return Math.log(Math.max(1 + Number.EPSILON, value));
}

/**
 * Рассчитать сопротивление контура заземления и радиус зоны молниезащиты.
 *
 * Формулы: ρ = ρ_грунта · 1,2; одиночный вертикальный электрод
 * R = ρ/(2πL)·ln(4L/d) при d = 0,05 м; группа электродов делится на n·1,1;
 * горизонтальная полоса R = ρ/(2πLs)·ln(2Ls²/(h·d)) при h = 0,7 и d = 0,04 м;
 * группы соединены параллельно; радиус зоны стержневого молниеотвода 1,5·H.
 * @param input Параметры расчёта.
 * @returns Детерминированный конечный результат.
 */
export function calculateGrounding(input: GroundingInput): GroundingResult {
    const soil = safeSoil(input.soil);
    const rho = SOIL_RESISTIVITY[soil] * SEASONAL_FACTOR;
    const length = safePositive(input.electrodeLengthM, DEFAULT_ELECTRODE_LENGTH_M);
    const count = Math.max(1, Math.floor(safePositive(input.electrodeCount, DEFAULT_ELECTRODE_COUNT)));
    const stripLength = safePositive(input.stripLengthM, DEFAULT_STRIP_LENGTH_M);
    const mastHeight = safePositive(input.mastHeightM, DEFAULT_MAST_HEIGHT_M);

    const singleElectrode = (rho / (2 * Math.PI * length)) * positiveLog((4 * length) / ELECTRODE_DIAMETER_M);
    const verticalGroup = singleElectrode / (count * MUTUAL_FACTOR);
    const horizontalStrip = (rho / (2 * Math.PI * stripLength))
        * positiveLog((2 * stripLength * stripLength) / (STRIP_DEPTH_M * STRIP_DIAMETER_M));

    const sum = verticalGroup + horizontalStrip;
    const resistance = sum > 0
        ? (verticalGroup * horizontalStrip) / sum
        : Math.min(verticalGroup, horizontalStrip);
    const resistanceOhm = Number.isFinite(resistance) && resistance >= 0
        ? resistance
        : FALLBACK_RESISTANCE_OHM;

    const radius = ZONE_RADIUS_FACTOR * mastHeight;
    const zoneRadiusM = Number.isFinite(radius) && radius >= 0 ? radius : FALLBACK_ZONE_RADIUS_M;

    return {
        resistanceOhm,
        zoneRadiusM,
        ok: resistanceOhm <= RESISTANCE_LIMIT_OHM,
        references: REFERENCES,
    };
}
