// © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
/** Высокоуровневые операции integrations: остатки, заказы, сметы (HITL). */

import { Inject, Injectable } from '@nestjs/common';
import {
    ExportToErpRequestSchema,
    ExportToErpResponseSchema,
    StockCheckResponseSchema,
    type ExportToErpRequest,
    type ExportToErpResponse,
    type IntegrationStatus,
    type ProjectGraph,
    type StockCheckItem,
    type StockCheckResponse,
} from '@voltwirecraft/shared/graph.schema.js';
import { ErpMcpService } from './erp-mcp.service.js';

/**
 * Координация MCP-инструментов. Все операции записи получают токен
 * подтверждения пользователя и не выполняются без него (HITL).
 */
@Injectable()
export class IntegrationService {
  /**
   * @param mcp — шлюз к MCP-серверам.
   */
  public constructor(@Inject(ErpMcpService) private readonly mcp: ErpMcpService) {}

  /**
   * Возвращает статусы подключений.
   *
   * @returns статусы Битрикс24 и МойСклад.
   */
  public async statusAsync(): Promise<IntegrationStatus[]> {
    return this.mcp.statusAsync();
  }

  /**
   * Проверяет остатки по спецификации.
   *
   * @param items — позиции спецификации.
   * @returns результат проверки с идентификатором операции.
   */
  public async checkStockAsync(items: readonly StockCheckItem[]): Promise<StockCheckResponse> {
    const response = await this.mcp.callToolAsync(
      'moysklad',
      'get_stock',
      { items: [...items] },
      StockCheckResponseSchema,
    );
    return response.data;
  }

  /**
   * Создаёт заказ в МойСклад только с токеном подтверждения.
   *
   * @param request — запрос с `confirmationToken`.
   * @returns результат выгрузки.
   */
  public async createOrderAsync(request: ExportToErpRequest): Promise<ExportToErpResponse> {
    const payload = ExportToErpRequestSchema.parse(request);
    const response = await this.mcp.callToolAsync(
      'moysklad',
      'create_order',
      { items: payload.items },
      ExportToErpResponseSchema,
      payload.confirmationToken,
    );
    return response.data;
  }

  /**
   * Отправляет смету в сделку Битрикс24 только с токеном подтверждения.
   *
   * @param request — запрос с `confirmationToken` и `dealId`.
   * @returns результат выгрузки.
   */
  public async sendEstimateAsync(request: ExportToErpRequest): Promise<ExportToErpResponse> {
    const payload = ExportToErpRequestSchema.parse(request);
    if (payload.dealId === undefined) {
      throw new Error('Для отправки сметы в Битрикс24 необходим dealId');
    }
    const response = await this.mcp.callToolAsync(
      'bitrix24',
      'send_estimate',
      { dealId: payload.dealId, items: payload.items },
      ExportToErpResponseSchema,
      payload.confirmationToken,
    );
    return response.data;
  }

  /**
   * Собирает позиции спецификации из графа проекта.
   * Артикул берётся из подписи узла (после сборки щита там указан SKU)
   * либо формируется из типа узла; кабели — из марки и сечения.
   *
   * @param graph — граф проекта.
   * @returns позиции для проверки остатков.
   */
  public buildBomFromGraph(graph: ProjectGraph): StockCheckItem[] {
    const counters = new Map<string, number>();
    const add = (sku: string): void => {
      counters.set(sku, (counters.get(sku) ?? 0) + 1);
    };

    for (const node of graph.nodes) {
      const match = /\(([^)]+)\)/.exec(node.label);
      add(match?.[1] ?? `${node.kind}-${node.id.slice(0, 8)}`);
    }
    for (const edge of graph.edges) {
      add(`${edge.cableBrand ?? 'CABLE'}-${edge.cableSpecs.crossSection}`);
    }

    return [...counters.entries()].map(([sku, quantity]) => ({ sku, quantity }));
  }
}
