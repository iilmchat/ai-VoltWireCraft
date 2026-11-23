// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** REST-контроллер проектов: единый формат ответа `ApiResponse` (RULES § 1.6). */

import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import {
    CreateProjectDtoSchema,
    UpdateProjectGraphDtoSchema,
    UuidSchema,
} from '@voltwirecraft/shared/graph.schema.js';
import type {
    CreateProjectDto,
    FloorPlanUploadDto,
    ProjectDto,
    UpdateProjectGraphDto,
} from '@voltwirecraft/shared/graph.schema.js';
import { CopilotChatRequestSchema } from '@voltwirecraft/shared/graph.schema.js';
import type {
  CopilotChatRequest,
  CopilotChatResponse,
  PueAuditReport,
  SelectivityTccResponse,
  ShortCircuitResponse,
} from '@voltwirecraft/shared/graph.schema.js';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ProjectScoped } from '../auth/project-scoped.decorator.js';
import { AssemblePanelRequestSchema } from '../agents/agents.schemas.js';
import { CopilotChatAgent } from '../agents/copilot-chat.agent.js';
import type { AssemblePanelRequest, AssemblePanelResult } from '../agents/agents.schemas.js';
import { PanelArchitectAgent } from '../agents/panel-architect.agent.js';
import { PueAuditorAgent } from '../agents/pue-auditor.agent.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { ApiResponse } from '../common/api-response.js';
import type { ProjectCalculationDto } from './calculation.js';
import { MAX_CAD_FILE_BYTES, MAX_FLOOR_PLAN_SIZE_BYTES } from './file-signature.js';
import type { UploadedFloorPlanFile } from './file-signature.js';
import { ProjectsService } from './projects.service.js';

/** Маршруты управления проектами и их графами. */
@Controller('projects')
export class ProjectsController {
  /**
   * @param service — сервис проектов.
   * @param panelArchitect — агент сборки щита.
   * @param pueAuditor — агент аудита ПУЭ-7.
   * @param copilot — агент интерактивного чата.
   */
  public constructor(
    @Inject(ProjectsService) private readonly service: ProjectsService,
    @Inject(PanelArchitectAgent) private readonly panelArchitect: PanelArchitectAgent,
    @Inject(PueAuditorAgent) private readonly pueAuditor: PueAuditorAgent,
    @Inject(CopilotChatAgent) private readonly copilot: CopilotChatAgent,
  ) {}

  /**
   * Создаёт проект с пустым графом.
   *
   * @param dto — валидированное тело запроса.
   * @returns созданный проект в обёртке `ApiResponse`.
   */
  @Post()
  public async createAsync(
    @Body(new ZodValidationPipe(CreateProjectDtoSchema)) dto: CreateProjectDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<ProjectDto>> {
    const data = await this.service.createAsync(dto, user.id);
    return { success: true, data, message: 'Проект создан' };
  }

  /**
   * Возвращает проект с графом, проверенным `ProjectGraphSchema`.
   *
   * @param id — UUID проекта.
   * @returns проект в обёртке `ApiResponse`.
   */
  @Get(':id')
  @ProjectScoped({ param: 'id', role: 'read' })
  public async getByIdAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<ProjectDto>> {
    const data = await this.service.getByIdAsync(id, user.id);
    return { success: true, data, message: 'Проект получен' };
  }

  /**
   * Сохраняет граф проекта.
   *
   * @param id — UUID проекта.
   * @param dto — тело запроса с новым графом.
   * @returns обновлённый проект в обёртке `ApiResponse`.
   */
  @Put(':id/graph')
  @ProjectScoped({ param: 'id', role: 'write' })
  public async updateGraphAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateProjectGraphDtoSchema)) dto: UpdateProjectGraphDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<ProjectDto>> {
    // Защита записи графа дублируется в ProjectsService.updateGraphAsync —
    // снятие GraphEditGuard не создаёт окна без проверки роли.
    const data = await this.service.updateGraphAsync(id, dto.graph, user.id);
    return { success: true, data, message: 'Граф сохранён' };
  }

  /**
   * Рассчитывает длины кабельных линий графа в расчётном ядре.
   *
   * @param id — UUID проекта.
   * @returns суммарная длина и статус каждой линии в обёртке `ApiResponse`.
   */
  @Post(':id/calculate')
  @ProjectScoped({ param: 'id', role: 'read' })
  public async calculateAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<ProjectCalculationDto>> {
    const data = await this.service.calculateAsync(id, user.id);
    return { success: true, data, message: 'Расчёт выполнен' };
  }

  /**
   * Загружает подложку PDF/PNG/JPG (до 25 МБ) в S3 или локальное хранилище.
   *
   * @param id — UUID проекта.
   * @param file — файл из multipart-запроса (поле `file`).
   * @returns метаданные подложки в обёртке `ApiResponse`.
   */
  @Post(':id/floor-plans')
  @ProjectScoped({ param: 'id', role: 'write' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_FLOOR_PLAN_SIZE_BYTES, files: 1 },
    }),
  )
  public async uploadFloorPlanAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @UploadedFile() file: UploadedFloorPlanFile | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<FloorPlanUploadDto>> {
    const data = await this.service.uploadFloorPlanAsync(id, file, user.id);
    return { success: true, data, message: 'Подложка загружена' };
  }

  /**
   * Проверяет ток однофазного КЗ и селективность через расчётное ядро.
   *
   * @param id — UUID проекта.
   * @returns результат расчёта петли «фаза-ноль».
   */
  @Post(':id/short-circuit')
  @ProjectScoped({ param: 'id', role: 'read' })
  public async calculateShortCircuitAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<ShortCircuitResponse>> {
    const data = await this.service.calculateShortCircuitAsync(id, user.id);
    return { success: true, data, message: 'Расчёт тока КЗ выполнен' };
  }

  /**
   * Проверяет селективность цепочки аппаратов по ВТХ через расчётное ядро.
   *
   * @param id — UUID проекта.
   * @returns протокол ВТХ в единой обёртке `ApiResponse`.
   */
  @Post(':id/selectivity-tcc')
  @ProjectScoped({ param: 'id', role: 'read' })
  public async checkSelectivityTccAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<SelectivityTccResponse>> {
    const data = await this.service.checkSelectivityTccAsync(id, user.id);
    return { success: true, data, message: 'Селективность ВТХ проверена' };
  }

  /**
   * Импортирует стены из DXF-плана (до 50 МБ), разбор выполняет calc-engine.
   *
   * @param id — UUID проекта.
   * @param file — файл DXF/DWG (поле `file`).
   * @returns проект с обновлёнными стенами.
   */
  @Post(':id/import-cad')
  @ProjectScoped({ param: 'id', role: 'write' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_CAD_FILE_BYTES, files: 1 },
    }),
  )
  public async importCadAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @UploadedFile() file: UploadedFloorPlanFile | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<ProjectDto>> {
    if (file === undefined) {
      throw new BadRequestException('Файл DXF не передан');
    }
    const data = await this.service.importCadAsync(id, file, user.id);
    return { success: true, data, message: 'Стены из CAD импортированы' };
  }

  /**
   * Обрабатывает сообщение ИИ-копилота и возвращает патч графа без записи в БД.
   * Применение предложения выполняется через `PUT /projects/:id/graph`.
   *
   * @param id — UUID проекта.
   * @param dto — сообщение, история и предпочтительный бренд.
   * @returns ответ копилота с предлагаемым графом.
   */
  @Post(':id/ai/chat')
  @ProjectScoped({ param: 'id', role: 'read' })
  public async chatAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(CopilotChatRequestSchema)) dto: CopilotChatRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<CopilotChatResponse>> {
    const project = await this.service.getByIdAsync(id, user.id);
    const data = await this.copilot.chatAsync(project.graph, dto);
    return { success: true, data, message: 'Предложение копилота подготовлено' };
  }

  /**
   * Собирает щит НКУ: расчёт уходит в calc-engine, артикулы — в каталог.
   *
   * @param id — UUID проекта.
   * @param dto — предпочтительный бренд оборудования.
   * @returns обновлённый граф и пояснение агента.
   */
  @Post(':id/ai/assemble-panel')
  @ProjectScoped({ param: 'id', role: 'write' })
  public async assemblePanelAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(AssemblePanelRequestSchema)) dto: AssemblePanelRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<AssemblePanelResult>> {
    const project = await this.service.getByIdAsync(id, user.id);
    const result = await this.panelArchitect.assembleAsync(project.graph, dto);
    await this.service.updateGraphAsync(id, result.graph, user.id);
    return { success: true, data: result, message: 'Щит НКУ собран' };
  }

  /**
   * Проводит аудит проекта по ПУЭ-7 с цитированием пунктов справочника.
   *
   * @param id — UUID проекта.
   * @returns структурированный отчёт.
   */
  @Post(':id/ai/audit-pue')
  @ProjectScoped({ param: 'id', role: 'read' })
  public async auditPueAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<PueAuditReport>> {
    const project = await this.service.getByIdAsync(id, user.id);
    const data = await this.pueAuditor.auditAsync(id, project.graph);
    return { success: true, data, message: 'Аудит ПУЭ-7 выполнен' };
  }
}
