// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Контракты импорта CAD и расчёта однофазного КЗ (DESIGN v0.3 § 3.2–3.3). */
import { WallSchema } from '@voltwirecraft/shared/graph.schema.js';
import { z } from 'zod';

/** Результат импорта DXF/DWG: нормализованные слои стен. */
export const CadImportResultSchema = z.object({
    /** Стены и проёмы в метрах (СИ). */
    walls: z.array(WallSchema),
    /** Число распознанных примитивов. */
    importedPrimitives: z.number().int().nonnegative(),
    /** Предупреждения разбора. */
    warnings: z.array(z.string()),
});
/** Результат импорта CAD. */
export type CadImportResult = z.infer<typeof CadImportResultSchema>;

/** Результат расчёта однофазного тока КЗ. */
export const ShortCircuitResultSchema = z.object({
    /** Ток однофазного КЗ, А. */
    shortCircuitCurrentA: z.number().nonnegative(),
    /** Полное сопротивление петли «фаза-ноль», Ом. */
    loopImpedanceOhm: z.number().nonnegative(),
    /** Время отключения, с. */
    tripTimeS: z.number().nonnegative(),
    /** Кратность срабатывания расцепителя. */
    multiplicity: z.number().nonnegative(),
    /** Признак корректной селективности. */
    selectivityOk: z.boolean(),
    /** Предупреждения. */
    warnings: z.array(z.string()),
    /** Ссылки на пункты нормативов. */
    references: z.array(z.string()),
});
/** Результат расчёта КЗ. */
export type ShortCircuitResult = z.infer<typeof ShortCircuitResultSchema>;

/** Результат расчёта линии: потеря напряжения и ток КЗ. */
export const LineElectricalResultSchema = z.object({
    /** Идентификатор линии (ребра графа). */
    edgeId: z.string().min(1),
    /** Потеря напряжения, %. */
    voltageDropPercent: z.number().nonnegative(),
    /** Предельная потеря напряжения, %. */
    voltageDropLimitPercent: z.number().positive(),
    /** Ток однофазного КЗ, А. */
    shortCircuitCurrentA: z.number().nonnegative(),
    /** Кратность срабатывания расцепителя. */
    multiplicity: z.number().nonnegative(),
    /** Селективность сохранена. */
    selectivityOk: z.boolean(),
});
/** Результат расчёта линии. */
export type LineElectricalResult = z.infer<typeof LineElectricalResultSchema>;

/** Сводный ответ расчёта КЗ по проекту. */
export const ProjectShortCircuitSchema = z.object({
    /** Идентификатор проекта. */
    projectId: z.string().min(1),
    /** Результаты по линиям. */
    lines: z.array(LineElectricalResultSchema),
    /** Общий ток КЗ на вводе, А. */
    serviceCurrentA: z.number().nonnegative(),
    /** Селективность по проекту. */
    selectivityOk: z.boolean(),
    /** Предупреждения. */
    warnings: z.array(z.string()),
});
/** Сводный ответ расчёта КЗ. */
export type ProjectShortCircuit = z.infer<typeof ProjectShortCircuitSchema>;
