// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Прокси-эндпоинты новых расчётов calc-engine для проекта. */

import { Controller, Inject, Param, Post, Body } from '@nestjs/common';
import {
    GroundingLightningRequestSchema,
    GroundingLightningResponseSchema,
    ThreePhaseShortCircuitRequestSchema,
    ThreePhaseShortCircuitResponseSchema,
    UuidSchema,
    type GroundingLightningResponse,
    type ThreePhaseShortCircuitResponse,
} from '@voltwirecraft/shared/graph.schema.js';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ProjectScoped } from '../auth/project-scoped.decorator.js';
import { CalcEngineClient } from '../calc-engine/calc-engine.client.js';
import type { ApiResponse } from '../common/api-response.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProjectsService } from './projects.service.js';

/** Расчёты КЗ и заземления в контексте проекта. */
@Controller('projects')
export class CalcProxyController {
  /**
   * @param projects — сервис проектов.
   * @param calcClient — клиент расчётного ядра.
   */
  public constructor(
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(CalcEngineClient) private readonly calcClient: CalcEngineClient,
  ) {}

  /**
   * Рассчитывает трёхфазное КЗ.
   *
   * @param id — идентификатор проекта.
   * @param body — параметры расчёта.
   * @returns результат ядра.
   */
  @Post(':id/calc/three-phase-sc')
  @ProjectScoped({ param: 'id', role: 'read' })
  public async threePhaseScAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(ThreePhaseShortCircuitRequestSchema)) body: unknown,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<ThreePhaseShortCircuitResponse>> {
    await this.projects.getByIdAsync(id, user.id);
    const request = ThreePhaseShortCircuitRequestSchema.parse(body);
    const data = ThreePhaseShortCircuitResponseSchema.parse(
      await this.calcClient.checkThreePhaseShortCircuitAsync(request),
    );
    return { success: true, data, message: 'Расчёт трёхфазного КЗ выполнен' };
  }

  /**
   * Рассчитывает заземление и молниезащиту.
   *
   * @param id — идентификатор проекта.
   * @param body — параметры расчёта.
   * @returns результат ядра.
   */
  @Post(':id/calc/grounding-lightning')
  @ProjectScoped({ param: 'id', role: 'read' })
  public async groundingAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(GroundingLightningRequestSchema)) body: unknown,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<GroundingLightningResponse>> {
    await this.projects.getByIdAsync(id, user.id);
    const request = GroundingLightningRequestSchema.parse(body);
    const data = GroundingLightningResponseSchema.parse(
      await this.calcClient.calculateGroundingAsync(request),
    );
    return { success: true, data, message: 'Расчёт заземления выполнен' };
  }
}
