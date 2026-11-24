// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * Единственная глобальная точка входа безопасности.
 *
 * Порядок зафиксирован в коде, а не в порядке регистрации APP_GUARD
 * разных модулей: сначала аутентификация (заполняет request.user),
 * затем авторизация проекта (читает request.user).
 */

import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Reflector } from '@nestjs/core';
// Импорты нужны как значения: emitDecoratorMetadata использует их для DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProjectAccessGuard } from './project-access.guard.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JwtAuthGuard } from './auth.guard.js';
import { REFRESH_AUTH_KEY } from './refresh-auth.decorator.js';
// Импорт нужен как значение: emitDecoratorMetadata использует его для DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RefreshGuard } from './refresh.guard.js';

@Injectable()
export class SecurityGuard implements CanActivate {
  public constructor(
    private readonly jwt: JwtAuthGuard,
    private readonly projectAccess: ProjectAccessGuard,
    private readonly refresh: RefreshGuard,
    private readonly reflector: Reflector,
  ) {}

  /**
   * `/auth/refresh` идёт по отдельной ветке: обычный access-JWT и
   * ProjectAccessGuard к нему не применяются, но запрос НЕ публичный.
   */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isRefresh = this.reflector.getAllAndOverride<boolean>(REFRESH_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isRefresh === true) {
      return this.refresh.canActivate(context);
    }

    const authenticated = await this.jwt.canActivate(context);
    if (!authenticated) {
      return false;
    }
    return this.projectAccess.canActivate(context);
  }
}
