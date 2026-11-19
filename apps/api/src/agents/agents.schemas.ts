// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Контракты ответов и запросов ИИ-агентов (валидация Zod на границе). */

import { z } from 'zod';
import {
  AutoPanelResponseSchema,
  ProjectGraphSchema,
} from '@voltwirecraft/shared/graph.schema.js';

/** Вызов инструмента, зафиксированный в протоколе агента. */
export const ToolCallSchema = z.object({
  /** Имя инструмента. */
  tool: z.string().min(1),
  /** Краткое описание результата. */
  summary: z.string().min(1),
});
/** Вызов инструмента. */
export type ToolCall = z.infer<typeof ToolCallSchema>;

/** Тело запроса автосборки щита. */
export const AssemblePanelRequestSchema = z.object({
  /** Желаемый бренд оборудования. */
  preferredBrand: z.enum(['IEK', 'EKF', 'КЭАЗ']).optional(),
});
/** Запрос автосборки. */
export type AssemblePanelRequest = z.infer<typeof AssemblePanelRequestSchema>;

/** Результат работы `PanelArchitectAgent`. */
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
/** Результат автосборки. */
export type AssemblePanelResult = z.infer<typeof AssemblePanelResultSchema>;
