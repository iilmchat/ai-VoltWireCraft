// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** JWT-guard и декоратор текущего пользователя. */

import { createParamDecorator, type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from './auth.service.js';
import { JwtService } from './jwt.service.js';

/** HTTP-запрос с авторизованным пользователем. */
export interface AuthenticatedRequest {
  /** Заголовки запроса. */
  readonly headers: Record<string, string | string[] | undefined>;
  /** Авторизованный пользователь. */
  user?: AuthUser;
}

/** Guard проверки Bearer-токена. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  /**
   * @param jwt — сервис проверки JWT.
   */
  public constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  /**
   * Проверяет токен и добавляет пользователя в запрос.
   *
   * @param context — контекст выполнения.
   * @returns true при успешной проверке.
   * @throws {UnauthorizedException} если токен отсутствует или недействителен.
   */
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];
    const token = Array.isArray(header) ? header[0] : header;
    if (token === undefined || !token.startsWith('Bearer ')) {
      throw new UnauthorizedException('Требуется Bearer-токен');
    }
    const payload = this.jwt.verify(token.slice('Bearer '.length));
    request.user = {
      id: payload.sub,
      email: payload.email,
      displayName: payload.email,
      role: payload.role,
    };
    return true;
  }
}

/** Возвращает авторизованного пользователя из запроса. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user === undefined) {
      throw new UnauthorizedException('Пользователь не авторизован');
    }
    return request.user;
  },
);
