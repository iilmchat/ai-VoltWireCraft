// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * Единственная глобальная точка входа безопасности.
 *
 * Порядок зафиксирован в коде, а не в порядке регистрации APP_GUARD
 * разных модулей: сначала аутентификация (заполняет request.user),
 * затем авторизация проекта (читает request.user).
 */

import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
// Импорты нужны как значения: emitDecoratorMetadata использует их для DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProjectAccessGuard } from './project-access.guard.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JwtAuthGuard } from './auth.guard.js';

@Injectable()
export class SecurityGuard implements CanActivate {
  public constructor(
    private readonly jwt: JwtAuthGuard,
    private readonly projectAccess: ProjectAccessGuard,
  ) {}

  /** Выполняет проверки строго в порядке JWT → ProjectAccess. */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await this.jwt.canActivate(context);
    if (!authenticated) {
      return false;
    }
    return this.projectAccess.canActivate(context);
  }
}
