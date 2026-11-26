// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Глобальный guard авторизации project-scoped маршрутов (SEC-02). */

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectPolicyService } from '../policy/project-policy.service.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { PROJECT_SCOPE_KEY, type ProjectScopeOptions } from './project-scoped.decorator.js';

/** HTTP-запрос с параметрами маршрута. */
type ProjectRequest = AuthenticatedRequest & { readonly params: Record<string, string | undefined> };

/**
 * Проверяет membership и роль для маршрутов, помеченных `@ProjectScoped`.
 * Для остальных маршрутов — no-op (аутентификация — задача `JwtAuthGuard`).
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  /**
   * @param reflector — доступ к metadata обработчика/контроллера.
   * @param policy — единая политика проектного доступа.
   */
  public constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ProjectPolicyService) private readonly policy: ProjectPolicyService,
  ) {}

  /** @inheritdoc */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<ProjectScopeOptions>(PROJECT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (scope === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ProjectRequest>();
    // Fail-closed: JWT guard обязан заполнить request.user до этого guard'а.
    if (request.user === undefined) {
      throw new UnauthorizedException('Пользователь не авторизован');
    }

    const projectId = request.params[scope.param];
    if (projectId === undefined || projectId === '') {
      // Не раскрываем, существует ли проект: любой некорректный идентификатор
      // получает тот же ответ 404, что и чужой проект.
      throw new NotFoundException(ProjectPolicyService.NOT_FOUND_MESSAGE);
    }

    await this.policy.requireAsync(projectId, request.user.id, scope.role);
    return true;
  }
}
