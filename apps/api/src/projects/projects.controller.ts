// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** REST-контроллер проектов: единый формат ответа `ApiResponse` (RULES § 1.6). */

import { Body, Controller, Get, Inject, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
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
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { ApiResponse } from '../common/api-response.js';
import { MAX_FLOOR_PLAN_SIZE_BYTES } from './file-signature.js';
import type { UploadedFloorPlanFile } from './file-signature.js';
import { ProjectsService } from './projects.service.js';

/** Маршруты управления проектами и их графами. */
@Controller('projects')
export class ProjectsController {
  /**
   * @param service — сервис проектов.
   */
  public constructor(@Inject(ProjectsService) private readonly service: ProjectsService) {}

  /**
   * Создаёт проект с пустым графом.
   *
   * @param dto — валидированное тело запроса.
   * @returns созданный проект в обёртке `ApiResponse`.
   */
  @Post()
  public async createAsync(
    @Body(new ZodValidationPipe(CreateProjectDtoSchema)) dto: CreateProjectDto,
  ): Promise<ApiResponse<ProjectDto>> {
    const data = await this.service.createAsync(dto);
    return { success: true, data, message: 'Проект создан' };
  }

  /**
   * Возвращает проект с графом, проверенным `ProjectGraphSchema`.
   *
   * @param id — UUID проекта.
   * @returns проект в обёртке `ApiResponse`.
   */
  @Get(':id')
  public async getByIdAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<ApiResponse<ProjectDto>> {
    const data = await this.service.getByIdAsync(id);
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
  public async updateGraphAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateProjectGraphDtoSchema)) dto: UpdateProjectGraphDto,
  ): Promise<ApiResponse<ProjectDto>> {
    const data = await this.service.updateGraphAsync(id, dto.graph);
    return { success: true, data, message: 'Граф сохранён' };
  }

  /**
   * Загружает подложку PDF/PNG/JPG (до 25 МБ) в S3 или локальное хранилище.
   *
   * @param id — UUID проекта.
   * @param file — файл из multipart-запроса (поле `file`).
   * @returns метаданные подложки в обёртке `ApiResponse`.
   */
  @Post(':id/floor-plans')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_FLOOR_PLAN_SIZE_BYTES, files: 1 },
    }),
  )
  public async uploadFloorPlanAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @UploadedFile() file: UploadedFloorPlanFile | undefined,
  ): Promise<ApiResponse<FloorPlanUploadDto>> {
    const data = await this.service.uploadFloorPlanAsync(id, file);
    return { success: true, data, message: 'Подложка загружена' };
  }
}
