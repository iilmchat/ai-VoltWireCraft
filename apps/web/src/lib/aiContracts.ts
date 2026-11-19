// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/**
 * Контракты ИИ-панели: канонические схемы из `@voltwirecraft/shared/graph.schema`.
 * RULES § 5.1: агент не вычисляет физические величины, только формирует предложение.
 */
import {
    AutoPanelResponseSchema,
    ProjectGraphSchema,
    PueAuditReportSchema,
} from '@voltwirecraft/shared/graph.schema.js';
import type {
    AutoPanelRequest,
    AutoPanelResponse,
    LineSizingRequest,
    LineSizingResponse,
    PueAuditReport,
    PueCitation,
    PueFinding,
    PueSeverity,
} from '@voltwirecraft/shared/graph.schema.js';
import { z } from 'zod';

// Канонические схемы и типы реэкспортируются без изменений.
export {
    AutoPanelResponseSchema,
    ProjectGraphSchema,
    PueAuditReportSchema,
};
export type {
    AutoPanelRequest,
    AutoPanelResponse,
    LineSizingRequest,
    LineSizingResponse,
    PueAuditReport,
    PueCitation,
    PueFinding,
    PueSeverity,
};

/** Вызов инструмента, зафиксированный в протоколе агента. */
export const ToolCallSchema = z.object({
    /** Имя инструмента. */
    tool: z.string().min(1),
    /** Краткое описание результата. */
    summary: z.string().min(1),
});
/** Вызов инструмента. */
export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * Результат `POST /projects/:id/ai/assemble-panel`.
 * Полностью соответствует `AssemblePanelResultSchema` контроллера API.
 * Все вложенные структуры — канонические (`ProjectGraphSchema`, `AutoPanelResponseSchema`).
 */
export const AssemblePanelResultSchema = z.object({
    /** Обновлённый граф проекта. */
    graph: ProjectGraphSchema,
    /** Пояснение агента на русском языке. */
    explanation: z.string().min(1),
    /** Протокол вызовов инструментов. */
    toolCalls: z.array(ToolCallSchema),
    /** Результат детерминированной сборки щита. */
    panel: AutoPanelResponseSchema,
});
/** Результат автосборки щита. */
export type AssemblePanelResult = z.infer<typeof AssemblePanelResultSchema>;
