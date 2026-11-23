// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Единая политика доступа к проектным данным (SEC-02, PO APPROVED matrix §4.2). */

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { ProjectRole } from '@voltwirecraft/shared/graph.schema.js';
import { DRIZZLE_DB } from '../database/drizzle.provider.js';
import type { Database } from '../database/drizzle.provider.js';
import { projectMembers, projects } from '../database/schema.js';

/** Требуемый уровень доступа к проекту. */
export type ProjectPermission = 'read' | 'write' | 'owner';

/**
 * Один источник истины для проектной авторизации.
 *
 * SEC-02: и отсутствующий проект, и пользователь без членства дают
 * одинаковый `404` (без раскрытия существования проекта). Недостаточная
 * роль участника даёт `403`. Глобальная роль `admin` намеренно не
 * расширяет доступ — действует deny-by-default.
 */
@Injectable()
export class ProjectPolicyService {
  /** Одинаковый текст/тело для несуществующего проекта и для outsider. */
  public static readonly NOT_FOUND_MESSAGE = 'Проект не найден';

  /**
   * @param db — типизированный Drizzle-клиент.
   */
  public constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /**
   * Возвращает роль пользователя в проекте.
   *
   * @param projectId — идентификатор проекта.
   * @param userId — идентификатор пользователя (обязателен).
   * @returns роль в проекте.
   * @throws {NotFoundException} проект не найден ИЛИ пользователь не участник.
   */
  public async roleForAsync(projectId: string, userId: string): Promise<ProjectRole> {
    const [project] = await this.db
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (project === undefined) {
      throw new NotFoundException(ProjectPolicyService.NOT_FOUND_MESSAGE);
    }
    if (project.ownerId !== null && project.ownerId === userId) {
      return 'owner';
    }

    const [member] = await this.db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    if (member === undefined) {
      throw new NotFoundException(ProjectPolicyService.NOT_FOUND_MESSAGE);
    }
    return member.role;
  }

  /**
   * Требует указанный уровень доступа к проекту.
   *
   * @param projectId — идентификатор проекта.
   * @param userId — идентификатор пользователя.
   * @param permission — `read` (любая роль), `write` (owner|engineer), `owner`.
   * @returns роль пользователя.
   * @throws {NotFoundException} проект не найден или пользователь не участник.
   * @throws {ForbiddenException} роль недостаточна.
   */
  public async requireAsync(
    projectId: string,
    userId: string,
    permission: ProjectPermission,
  ): Promise<ProjectRole> {
    const role = await this.roleForAsync(projectId, userId);
    if (!ProjectPolicyService.isAllowed(role, permission)) {
      throw new ForbiddenException('Недостаточно прав для выполнения операции');
    }
    return role;
  }

  /** Проверка «просмотр»: доступна Owner, Engineer и Client. */
  public async requireReadAsync(projectId: string, userId: string): Promise<ProjectRole> {
    return this.requireAsync(projectId, userId, 'read');
  }

  /** Проверка записи проектных данных: доступна Owner и Engineer. */
  public async requireEditorAsync(projectId: string, userId: string): Promise<ProjectRole> {
    return this.requireAsync(projectId, userId, 'write');
  }

  /** Проверка управления участниками: доступна только Owner. */
  public async requireOwnerAsync(projectId: string, userId: string): Promise<ProjectRole> {
    return this.requireAsync(projectId, userId, 'owner');
  }

  /**
   * Сопоставление роли и требования (утверждённая матрица SEC-02 §4.2).
   */
  private static isAllowed(role: ProjectRole, permission: ProjectPermission): boolean {
    switch (permission) {
      case 'read':
        return true;
      case 'write':
        return role === 'owner' || role === 'engineer';
      case 'owner':
        return role === 'owner';
    }
  }
}
