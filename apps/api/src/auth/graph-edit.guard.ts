// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Guard, запрещающий роли `client` перезаписывать граф проекта. */

import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';
import { ProjectAccessService } from './project-access.service.js';

/** Проверяет право редактирования графа (RULES § 5.2, RBAC v0.9). */
@Injectable()
export class GraphEditGuard implements CanActivate {
  /**
   * @param access — сервис прав доступа.
   */
  public constructor(@Inject(ProjectAccessService) private readonly access: ProjectAccessService) {}

  /**
   * Разрешает редактирование ролям `owner` и `engineer`.
   *
   * @param context — контекст выполнения.
   * @returns true если редактирование разрешено.
   */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { params: { id: string } }>();
    if (request.user === undefined) {
      throw new Error('GraphEditGuard требует JwtAuthGuard');
    }
    await this.access.requireEditorAsync(request.params.id, request.user.id);
    return true;
  }
}
