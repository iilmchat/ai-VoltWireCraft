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
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthRateLimitService, type AuthRateLimitOperation } from './auth-rate-limit.service.js';
import { REFRESH_AUTH_KEY } from './refresh-auth.decorator.js';
// Импорт нужен как значение: emitDecoratorMetadata использует его для DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RefreshGuard } from './refresh.guard.js';

/** Минимальный контракт запроса для определения операции и клиента. */
interface RateLimitedRequest {
  readonly url?: string;
  readonly method?: string;
  /** Express `req.ip`; proxy-заголовки намеренно не используются. */
  readonly ip?: string;
  readonly headers?: Record<string, string | string[] | undefined>;
  readonly auth?: { readonly sub?: string };
  readonly user?: { readonly id: string };
  readonly body?: { readonly email?: unknown };
}

@Injectable()
export class SecurityGuard implements CanActivate {
  public constructor(
    private readonly jwt: JwtAuthGuard,
    private readonly projectAccess: ProjectAccessGuard,
    private readonly refresh: RefreshGuard,
    private readonly reflector: Reflector,
    private readonly rateLimit: AuthRateLimitService,
  ) {}

  /**
   * `/auth/refresh` идёт по отдельной ветке: обычный access-JWT и
   * ProjectAccessGuard к нему не применяются, но запрос НЕ публичный.
   */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const operation = this.operationFor(request);
    // F-03: пред-аутентификационный лимит по адресу соединения.
    if (operation !== undefined) {
      await this.rateLimit.checkAsync(operation, this.clientIdentity(request));
    }
    // F-10: дополнительный per-account лимит для login, независимо от IP и
    // от существования учётной записи. Нормализация та же, что в AuthService.
    if (operation === 'login') {
      const email = request.body?.email;
      if (typeof email === 'string' && email.length > 0) {
        await this.rateLimit.checkAccountAsync(email.toLowerCase());
      }
    }

    const isRefresh = this.reflector.getAllAndOverride<boolean>(REFRESH_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isRefresh === true) {
      const allowed = await this.refresh.canActivate(context);
      if (!allowed) {
        return false;
      }
      // Дополнительный лимит по уже проверенной идентичности: смена IP не помогает.
      const sub = request.auth?.sub;
      if (sub !== undefined) {
        await this.rateLimit.checkAsync(operation ?? 'refresh', sub);
      }
      return true;
    }

    const authenticated = await this.jwt.canActivate(context);
    if (!authenticated) {
      return false;
    }
    if (operation === 'logout') {
      const sub = request.auth?.sub ?? request.user?.id;
      if (sub !== undefined) {
        await this.rateLimit.checkAsync('logout', sub);
      }
    }
    return this.projectAccess.canActivate(context);
  }

  /** Определяет чувствительную auth-операцию по методу и пути. */
  private operationFor(request: RateLimitedRequest): AuthRateLimitOperation | undefined {
    if (request.method !== 'POST') {
      return undefined;
    }
    const path = (request.url ?? '').split('?')[0];
    if (path === '/auth/login') {
      return 'login';
    }
    if (path === '/auth/refresh') {
      return 'refresh';
    }
    if (path === '/auth/logout' || path === '/auth/logout-all') {
      return 'logout';
    }
    return undefined;
  }

  /**
   * Идентификатор клиента до аутентификации. `req.ip` Express не доверяет
   * X-Forwarded-For без явного `trust proxy`, поэтому подмена заголовка
   * не позволяет обойти лимит.
   */
  private clientIdentity(request: RateLimitedRequest): string {
    return request.ip ?? 'unknown';
  }
}
