// © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
/** REST-контроллер MCP-интеграций и светотехнического расчёта. */

import { Controller, Get, Inject, Param, Post, Body } from '@nestjs/common';
import {
    ExportToErpResponseSchema,
    UuidSchema,
    type ExportToErpRequest,
    type ExportToErpResponse,
    type IntegrationStatus,
    type LightingCalcResponse,
    type StockCheckResponse,
} from '@voltwirecraft/shared/graph.schema.js';
import { CalcEngineClient } from '../calc-engine/calc-engine.client.js';
import type { ApiResponse } from '../common/api-response.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProjectsService } from '../projects/projects.service.js';
import {
    CheckStockRequestSchema,
    CreateOrderRequestSchema,
    LightingCalculateRequestSchema,
    SendEstimateRequestSchema,
} from './integrations.schemas.js';
import type {
    CheckStockRequest,
    CreateOrderRequest,
    LightingCalculateRequest,
    SendEstimateRequest,
} from './integrations.schemas.js';
import { IntegrationService } from './integration.service.js';

/** Эндпоинты статуса интеграций и операций с проектом. */
@Controller()
export class IntegrationsController {
  /**
   * @param projects — сервис проектов.
   * @param calcClient — клиент расчётного ядра.
   * @param integrations — сервис MCP-интеграций.
   */
  public constructor(
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(CalcEngineClient) private readonly calcClient: CalcEngineClient,
    @Inject(IntegrationService) private readonly integrations: IntegrationService,
  ) {}

  /**
   * Проверяет доступность MCP-серверов.
   *
   * @returns статусы подключений.
   */
  @Get('integrations/status')
  public async statusAsync(): Promise<ApiResponse<IntegrationStatus[]>> {
    const data = await this.integrations.statusAsync();
    return { success: true, data, message: 'Статус интеграций получен' };
  }

  /**
   * Рассчитывает освещённость выбранной комнаты проекта в calc-engine.
   *
   * @param id — идентификатор проекта.
   * @param dto — комната и параметры светильников.
   * @returns результат расчёта.
   */
  @Post('projects/:id/lighting/calculate')
  public async calculateLightingAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(LightingCalculateRequestSchema)) dto: LightingCalculateRequest,
  ): Promise<ApiResponse<LightingCalcResponse>> {
    const project = await this.projects.getByIdAsync(id);
    const room = project.graph.rooms.find((item) => item.id === dto.roomId);
    if (room === undefined) {
      throw new Error('Помещение не найдено в графе проекта');
    }

    const data = await this.calcClient.calculateLightingAsync({
      polygonM: room.polygon,
      ceilingHeightM: project.graph.floorPlan.ceilingHeightM,
      zoneType: room.type,
      luminaireFluxLm: dto.luminaireFluxLm,
      luminairePowerW: dto.luminairePowerW,
      ...(dto.safetyFactor !== undefined ? { safetyFactor: dto.safetyFactor } : {}),
    });
    return { success: true, data, message: 'Расчёт освещённости выполнен' };
  }

  /**
   * Проверяет остатки по спецификации проекта.
   *
   * @param id — идентификатор проекта.
   * @param dto — явный список позиций или пустое тело.
   * @returns результат проверки остатков.
   */
  @Post('projects/:id/integrations/moysklad/check-stock')
  public async checkStockAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(CheckStockRequestSchema)) dto: CheckStockRequest,
  ): Promise<ApiResponse<StockCheckResponse>> {
    let items = dto.items;
    if (items === undefined) {
      const project = await this.projects.getByIdAsync(id);
      items = this.integrations.buildBomFromGraph(project.graph);
    }
    const data = await this.integrations.checkStockAsync(items);
    return { success: true, data, message: 'Остатки проверены' };
  }

  /**
   * Создаёт заказ в МойСклад (требуется HITL-подтверждение).
   *
   * @param id — идентификатор проекта.
   * @param dto — позиции и токен подтверждения.
   * @returns результат выгрузки.
   */
  @Post('projects/:id/integrations/moysklad/create-order')
  public async createOrderAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(CreateOrderRequestSchema)) dto: CreateOrderRequest,
  ): Promise<ApiResponse<ExportToErpResponse>> {
    const request: ExportToErpRequest = {
      projectId: id,
      target: 'moysklad',
      items: dto.items,
      confirmationToken: dto.confirmationToken,
    };
    const data = ExportToErpResponseSchema.parse(await this.integrations.createOrderAsync(request));
    return { success: true, data, message: 'Заказ создан в МойСклад' };
  }

  /**
   * Отправляет смету в сделку Битрикс24 (требуется HITL-подтверждение).
   *
   * @param id — идентификатор проекта.
   * @param dto — позиции, сделка и токен подтверждения.
   * @returns результат выгрузки.
   */
  @Post('projects/:id/integrations/bitrix24/send-estimate')
  public async sendEstimateAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(SendEstimateRequestSchema)) dto: SendEstimateRequest,
  ): Promise<ApiResponse<ExportToErpResponse>> {
    const request: ExportToErpRequest = {
      projectId: id,
      target: 'bitrix24',
      items: dto.items,
      dealId: dto.dealId,
      confirmationToken: dto.confirmationToken,
    };
    const data = ExportToErpResponseSchema.parse(await this.integrations.sendEstimateAsync(request));
    return { success: true, data, message: 'Смета отправлена в Битрикс24' };
  }
}
