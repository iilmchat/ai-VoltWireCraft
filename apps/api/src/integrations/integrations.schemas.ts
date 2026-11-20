// © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
/** Локальные DTO для MCP-интеграций и светотехнического расчёта. */

import { z } from 'zod';
import {
    StockCheckItemSchema,
    UuidSchema,
} from '@voltwirecraft/shared/graph.schema.js';

/** Запрос расчёта освещённости комнаты проекта. */
export const LightingCalculateRequestSchema = z.object({
    /** Идентификатор зоны помещения в графе. */
    roomId: UuidSchema,
    /** Световой поток одного светильника, lm. */
    luminaireFluxLm: z.number().positive(),
    /** Мощность одного светильника, W. */
    luminairePowerW: z.number().positive(),
    /** Коэффициент запаса; по умолчанию 1,15. */
    safetyFactor: z.number().positive().optional(),
});
/** Запрос расчёта освещённости. */
export type LightingCalculateRequest = z.infer<typeof LightingCalculateRequestSchema>;

/** Запрос проверки остатков: можно передать позиции явно или собрать из графа. */
export const CheckStockRequestSchema = z.object({
    /** Позиции; если не заданы — собираются из графа проекта. */
    items: z.array(StockCheckItemSchema).min(1).optional(),
});
/** Запрос проверки остатков. */
export type CheckStockRequest = z.infer<typeof CheckStockRequestSchema>;

/** Запрос создания заказа в МойСклад. */
export const CreateOrderRequestSchema = z.object({
    /** Позиции заказа. */
    items: z.array(StockCheckItemSchema).min(1),
    /** Токен подтверждения пользователя (HITL). */
    confirmationToken: z.string().min(1),
});
/** Запрос создания заказа. */
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

/** Запрос отправки сметы в сделку Битрикс24. */
export const SendEstimateRequestSchema = z.object({
    /** Позиции сметы. */
    items: z.array(StockCheckItemSchema).min(1),
    /** Идентификатор сделки. */
    dealId: z.string().min(1),
    /** Токен подтверждения пользователя (HITL). */
    confirmationToken: z.string().min(1),
});
/** Запрос отправки сметы. */
export type SendEstimateRequest = z.infer<typeof SendEstimateRequestSchema>;
