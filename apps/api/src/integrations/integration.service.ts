// © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
/** Высокоуровневые операции integrations: остатки, заказы, сметы (HITL). */

import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
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
import { ProjectPolicyService } from '../policy/project-policy.service.js';
import { HitlService } from '../security/hitl.service.js';
import { ErpMcpService } from './erp-mcp.service.js';

/**
 * Координация MCP-инструментов. Все операции записи получают токен
 * подтверждения пользователя и не выполняются без него (HITL).
 */
@Injectable()
export class IntegrationService {
  /**
   * @param mcp — шлюз к MCP-серверам.
   * @param policy — политика проектного доступа (проверка membership).
   * @param hitl — проверка подписанного HITL-подтверждения.
   */
  public constructor(
    @Inject(ErpMcpService) private readonly mcp: ErpMcpService,
    @Inject(ProjectPolicyService) private readonly policy: ProjectPolicyService,
    @Inject(HitlService) private readonly hitl: HitlService,
  ) {}

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
    // API↔MCP: корректное имя инструмента и плоский payload (MCP Pydantic-модель).
    const response = await this.mcp.callToolAsync(
      'moysklad',
      'moysklad_check_stock',
      { skus: items.map((item) => item.sku) },
      StockCheckResponseSchema,
    );
    return response.data;
  }

  /**
   * Создаёт заказ в МойСклад. До решения PO-D05/PO-D14a операция fail-closed:
   * проверяется членство, роль, реальный HITL-токен, затем запись запрещена.
   */
  public async createOrderAsync(request: ExportToErpRequest, userId: string): Promise<ExportToErpResponse> {
    this.assertUserContext(userId);
    // Сервисная проверка独立于 HTTP guard (прямой DI-вызов не обходит).
    await this.policy.requireEditorAsync(request.projectId, userId);
    const payload = ExportToErpRequestSchema.parse(request);
    await this.assertHitlAsync(payload, userId, 'create_order');
    this.assertErpWritesEnabled();

    const response = await this.mcp.callToolAsync(
      'moysklad',
      'moysklad_create_customer_order',
      {
        projectTitle: payload.projectId,
        items: payload.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
      },
      ExportToErpResponseSchema,
      payload.confirmationToken,
    );
    return response.data;
  }

  /**
   * Отправляет смету в Битрикс24. Fail-closed до решения PO-D05/PO-D14a.
   */
  public async sendEstimateAsync(request: ExportToErpRequest, userId: string): Promise<ExportToErpResponse> {
    this.assertUserContext(userId);
    await this.policy.requireEditorAsync(request.projectId, userId);
    const payload = ExportToErpRequestSchema.parse(request);
    if (payload.dealId === undefined) {
      throw new Error('Для отправки сметы в Битрикс24 необходим dealId');
    }
    await this.assertHitlAsync(payload, userId, 'send_estimate');
    this.assertErpWritesEnabled();

    const response = await this.mcp.callToolAsync(
      'bitrix24',
      'bitrix24_add_bom_to_deal',
      {
        dealId: Number(payload.dealId),
        title: payload.projectId,
        totalRub: 0,
        itemsSummary: payload.items
          .map((item) => `${item.sku}: ${item.quantity}`)
          .join('; '),
      },
      ExportToErpResponseSchema,
      payload.confirmationToken,
    );
    return response.data;
  }

  /**
   * Реальная проверка HITL-подтверждения до любого вызова MCP.
   * HitlService проверяет подпись, привязку к sub/projectId/action/itemsHash/dealId,
   * exp и одноразовость jti. Дополнительно проверяем confirmedBy и актуальные
   * полномочия подтверждающего — до утверждения PO-D14a они не определены.
   */
  private async assertHitlAsync(
    payload: ExportToErpRequest,
    userId: string,
    action: 'create_order' | 'send_estimate',
  ): Promise<void> {
    const itemsHash = this.buildErpItemsHash(payload.projectId, action, payload.items, payload.dealId);
    const verified = await this.hitl.verifyAsync(payload.confirmationToken, {
      sub: userId,
      projectId: payload.projectId,
      action,
      itemsHash,
      ...(action === 'send_estimate' && payload.dealId !== undefined ? { dealId: payload.dealId } : {}),
    });

    if (verified.sub !== userId || verified.confirmedBy.length === 0) {
      throw new UnauthorizedException('HITL-подтверждение выпущено для другого пользователя');
    }
    if (action === 'create_order' && verified.dealId !== undefined) {
      throw new UnauthorizedException('HITL-подтверждение содержит неприменимый dealId');
    }
    this.assertApproverAuthority(verified.confirmedBy);
  }

  /** Канонический хэш позиций: одинаковый для выпуска и проверки подтверждения. */
  private buildErpItemsHash(
    projectId: string,
    action: 'create_order' | 'send_estimate',
    items: readonly StockCheckItem[],
    dealId?: string,
  ): string {
    const canonical = {
      projectId,
      action,
      items: [...items]
        .map((item) => ({ sku: item.sku, quantity: item.quantity }))
        .sort((left, right) => left.sku.localeCompare(right.sku) || left.quantity - right.quantity),
      dealId: dealId ?? null,
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  /**
   * PO-D14a: полномочия approver не утверждены — любое подтверждение отвергается.
   * Не назначаем Owner/Engineer автоматически и не создаём делегирование.
   */
  private assertApproverAuthority(_confirmedBy: string): void {
    throw new ForbiddenException('HITL approver policy is not approved (PO-D14a)');
  }

  /**
   * PO-D05: роли ERP/CRM не утверждены — обе write-операции закрыты для всех ролей.
   * Existing `write` не трактуется как разрешение на финансовую операцию.
   */
  private assertErpWritesEnabled(): void {
    throw new ForbiddenException('ERP/CRM write operations are disabled until PO-D05 decision');
  }

  /**
   * Проверяет, что передан идентификатор пользователя.
   *
   * @param userId — идентификатор пользователя из аутентифицированного запроса.
   * @throws {ForbiddenException} если контекст пользователя отсутствует.
   */
  private assertUserContext(userId: string): void {
    if (userId === '') {
      throw new ForbiddenException('Операция требует контекста пользователя');
    }
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
