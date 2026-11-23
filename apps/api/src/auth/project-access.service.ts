// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** RBAC проекта, управление участниками и комментариями согласования. */

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import {
    type AddProjectMemberDto,
    type CreateCommentDto,
    type ProjectCommentDto,
    type ProjectDto,
    type ProjectMemberDto,
    type ProjectRole,
} from '@voltwirecraft/shared/graph.schema.js';
import { DRIZZLE_DB } from '../database/drizzle.provider.js';
import type { Database } from '../database/drizzle.provider.js';
import { projectComments, projectMembers, projects, users } from '../database/schema.js';
import { ProjectPolicyService } from '../policy/project-policy.service.js';
import { AuthService } from './auth.service.js';

/**
 * Проверяет права и управляет участниками/комментариями проекта.
 * Роль `client` может комментировать и согласовывать, но не редактировать граф.
 */
@Injectable()
export class ProjectAccessService {
  /**
   * @param db — типизированный Drizzle-клиент.
   * @param auth — сервис авторизации.
   * @param policy — единая политика проектного доступа (SEC-02).
   */
  public constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ProjectPolicyService) private readonly policy: ProjectPolicyService,
  ) {}

  /**
   * Возвращает роль пользователя в проекте.
   *
   * @param projectId — идентификатор проекта.
   * @param userId — идентификатор пользователя.
   * @returns роль.
   * @throws {ForbiddenException} если доступа нет.
   */
  public async roleForAsync(projectId: string, userId: string): Promise<ProjectRole> {
    return this.policy.roleForAsync(projectId, userId);
  }

  /**
   * Запрещает редактирование графа роли `client`.
   *
   * @param projectId — идентификатор проекта.
   * @param userId — идентификатор пользователя.
   * @returns роль пользователя.
   * @throws {ForbiddenException} если роль `client`.
   */
  public async requireEditorAsync(projectId: string, userId: string): Promise<ProjectRole> {
    return this.policy.requireEditorAsync(projectId, userId);
  }

  /**
   * Возвращает проекты, доступные пользователю.
   *
   * @param userId — идентификатор пользователя.
   * @returns список DTO проектов.
   */
  public async listProjectsAsync(userId: string): Promise<ProjectDto[]> {
    const memberRows = await this.db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    const rows = await this.db
      .select()
      .from(projects)
      .where(
        or(
          eq(projects.ownerId, userId),
          memberRows.length > 0 ? inArray(projects.id, memberRows.map((row) => row.projectId)) : undefined,
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      objectType: row.objectType,
      networkSystem: row.networkSystem,
      graph: row.graphJson,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  /**
   * Добавляет участника проекта (только владелец).
   *
   * @param projectId — идентификатор проекта.
   * @param ownerId — идентификатор владельца.
   * @param dto — email и роль.
   * @returns DTO участника.
   * @throws {ForbiddenException} если пользователь не владелец.
   */
  public async addMemberAsync(
    projectId: string,
    ownerId: string,
    dto: AddProjectMemberDto,
  ): Promise<ProjectMemberDto> {
    await this.policy.requireOwnerAsync(projectId, ownerId);
    const user = await this.auth.findByEmailAsync(dto.email);
    if (user === undefined) {
      throw new NotFoundException('Пользователь с таким email не зарегистрирован');
    }
    const [row] = await this.db
      .insert(projectMembers)
      .values({ projectId, userId: user.id, role: dto.role })
      .onConflictDoNothing({ target: [projectMembers.projectId, projectMembers.userId] })
      .returning();
    if (row === undefined) {
      throw new ForbiddenException('Пользователь уже является участником проекта');
    }
    return {
      id: row.id,
      projectId: row.projectId,
      userId: row.userId,
      email: user.email,
      role: row.role,
    };
  }

  /**
   * Возвращает комментарии проекта.
   *
   * @param projectId — идентификатор проекта.
   * @param userId — идентификатор пользователя.
   * @returns список комментариев.
   */
  public async listCommentsAsync(projectId: string, userId: string): Promise<ProjectCommentDto[]> {
    await this.policy.requireReadAsync(projectId, userId);
    const rows = await this.db
      .select({ comment: projectComments, authorEmail: users.email })
      .from(projectComments)
      .innerJoin(users, eq(users.id, projectComments.authorId))
      .where(eq(projectComments.projectId, projectId))
      .orderBy(desc(projectComments.createdAt));

    return rows.map(({ comment, authorEmail }) => ({
      id: comment.id,
      projectId: comment.projectId,
      authorId: comment.authorId,
      authorEmail,
      text: comment.body,
      resolved: comment.status === 'resolved',
      createdAt: comment.createdAt.toISOString(),
    }));
  }

  /**
   * Добавляет комментарий (доступно всем участникам, включая `client`).
   *
   * @param projectId — идентификатор проекта.
   * @param userId — идентификатор автора.
   * @param dto — текст замечания.
   * @returns DTO комментария.
   */
  public async addCommentAsync(
    projectId: string,
    userId: string,
    dto: CreateCommentDto,
  ): Promise<ProjectCommentDto> {
    // SEC-02 B-06: до любой записи проверяем членство (404 для outsider).
    await this.policy.requireReadAsync(projectId, userId);
    const author = await this.auth.meAsync(userId);
    const [row] = await this.db
      .insert(projectComments)
      .values({
        projectId,
        authorId: userId,
        viewTab: 'plan',
        body: dto.text,
        status: 'open',
      })
      .returning();
    if (row === undefined) {
      throw new Error('Не удалось создать комментарий');
    }
    return {
      id: row.id,
      projectId: row.projectId,
      authorId: row.authorId,
      authorEmail: author.email,
      text: row.body,
      resolved: false,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Отмечает комментарий согласованным (доступно всем участникам).
   *
   * @param projectId — идентификатор проекта.
   * @param commentId — идентификатор комментария.
   * @param userId — идентификатор пользователя.
   * @returns обновлённый DTO.
   */
  public async resolveCommentAsync(
    projectId: string,
    commentId: string,
    userId: string,
  ): Promise<ProjectCommentDto> {
    // SEC-02: outsider получает 404; комментарий ищется только внутри проекта.
    await this.policy.requireReadAsync(projectId, userId);
    const author = await this.auth.meAsync(userId);
    const [row] = await this.db
      .update(projectComments)
      .set({ status: 'resolved' })
      .where(and(eq(projectComments.id, commentId), eq(projectComments.projectId, projectId)))
      .returning();
    if (row === undefined) {
      throw new NotFoundException('Комментарий не найден');
    }
    return {
      id: row.id,
      projectId: row.projectId,
      authorId: row.authorId,
      authorEmail: author.email,
      text: row.body,
      resolved: true,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
