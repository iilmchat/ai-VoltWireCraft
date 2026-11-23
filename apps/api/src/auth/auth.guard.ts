// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Глобальный JWT-guard и декоратор текущего пользователя. */

import {
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
// Импорт нужен как значение: emitDecoratorMetadata использует его для DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { AuthUser } from './auth.service.js';
import { AuthService } from './auth.service.js';
import { JwtService } from './jwt.service.js';

/** Данные авторизованного запроса. */
export interface AuthenticatedRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
  auth?: { readonly sub: string; readonly jti: string };
}

/**
 * Аутентификация по access-токену.
 *
 * Вызывается первым внутри единого `SecurityGuard` (APP_GUARD в AuthModule).
 * Поддерживает `@Public()` через `Reflector`; на уровне приложения fail-closed:
 * при отсутствии метаданных токен.required.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AuthService) private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (raw === undefined || !raw.startsWith('Bearer ')) {
      throw new UnauthorizedException('Требуется Bearer-токен');
    }

    const payload = this.jwt.verify(raw.slice('Bearer '.length), 'access');
    // SEC-02: роль и отображаемое имя берутся из БД, а не из payload.
    const user = await this.auth.meAsync(payload.sub);
    request.user = user;
    request.auth = { sub: payload.sub, jti: payload.jti };
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
