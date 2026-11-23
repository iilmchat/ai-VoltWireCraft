// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Эндпоинты списка проектов, участников и комментариев. */

import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import {
    AddProjectMemberDtoSchema,
    CreateCommentDtoSchema,
    UuidSchema,
    type ProjectCommentDto,
    type ProjectDto,
    type ProjectMemberDto,
} from '@voltwirecraft/shared/graph.schema.js';
import type { AddProjectMemberDto, CreateCommentDto } from '@voltwirecraft/shared/graph.schema.js';
import type { ApiResponse } from '../common/api-response.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from './auth.guard.js';
import type { AuthUser } from './auth.service.js';
import { ProjectAccessService } from './project-access.service.js';

/** Проекты пользователя, участники и согласование. */
@Controller('projects')
export class ProjectAccessController {
  /**
   * @param access — сервис прав доступа.
   */
  public constructor(@Inject(ProjectAccessService) private readonly access: ProjectAccessService) {}

  /**
   * Список проектов текущего пользователя.
   *
   * @param user — авторизованный пользователь.
   * @returns проекты.
   */
  @Get()
  public async listAsync(@CurrentUser() user: AuthUser): Promise<ApiResponse<ProjectDto[]>> {
    const data = await this.access.listProjectsAsync(user.id);
    return { success: true, data, message: 'Список проектов получен' };
  }

  /**
   * Добавляет участника проекта.
   *
   * @param id — идентификатор проекта.
   * @param user — авторизованный пользователь.
   * @param dto — email и роль.
   * @returns участник.
   */
  @Post(':id/members')
  public async addMemberAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(AddProjectMemberDtoSchema)) dto: AddProjectMemberDto,
  ): Promise<ApiResponse<ProjectMemberDto>> {
    const data = await this.access.addMemberAsync(id, user.id, dto);
    return { success: true, data, message: 'Участник добавлен' };
  }

  /**
   * Список комментариев проекта.
   *
   * @param id — идентификатор проекта.
   * @param user — авторизованный пользователь.
   * @returns комментарии.
   */
  @Get(':id/comments')
  public async listCommentsAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<ProjectCommentDto[]>> {
    const data = await this.access.listCommentsAsync(id, user.id);
    return { success: true, data, message: 'Комментарии получены' };
  }

  /**
   * Добавляет комментарий (доступно роли `client`).
   *
   * @param id — идентификатор проекта.
   * @param user — авторизованный пользователь.
   * @param dto — текст.
   * @returns комментарий.
   */
  @Post(':id/comments')
  public async addCommentAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateCommentDtoSchema)) dto: CreateCommentDto,
  ): Promise<ApiResponse<ProjectCommentDto>> {
    const data = await this.access.addCommentAsync(id, user.id, dto);
    return { success: true, data, message: 'Комментарий добавлен' };
  }

  /**
   * Отмечает комментарий согласованным.
   *
   * @param id — идентификатор проекта.
   * @param commentId — идентификатор комментария.
   * @param user — авторизованный пользователь.
   * @returns обновлённый комментарий.
   */
  @Patch(':id/comments/:commentId')
  public async resolveCommentAsync(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('commentId', new ZodValidationPipe(UuidSchema)) commentId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiResponse<ProjectCommentDto>> {
    const data = await this.access.resolveCommentAsync(id, commentId, user.id);
    return { success: true, data, message: 'Комментарий согласован' };
  }
}
