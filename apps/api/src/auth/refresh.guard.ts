// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Специализированная проверка `/auth/refresh` (SEC-02 Stage 2, TEC-02). */

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeOrigin, type Env } from '../config/env.schema.js';
import { RefreshSessionService, type VerifiedRefresh } from './refresh-session.service.js';

/** Имя HttpOnly-cookie с refresh-токеном. */
export const REFRESH_COOKIE_NAME = 'vwc_refresh';

/** Запрос refresh-эндпоинта. */
export interface RefreshRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  body?: { readonly refreshToken?: unknown };
  refreshToken?: string;
  refreshVerified?: VerifiedRefresh;
  auth?: { readonly sub: string; readonly jti: string; readonly sid: string };
}

/**
 * Проверяет refresh-токен из cookie (primary) или тела (fallback для Tauri/тестов).
 * Не является обычным JWT- или project-guard'ом и не делает маршрут публичным.
 */
@Injectable()
export class RefreshGuard implements CanActivate {
  public constructor(
    @Inject(RefreshSessionService) private readonly sessions: RefreshSessionService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  /** @inheritdoc */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RefreshRequest>();
    const cookieToken = this.readCookie(request.headers['cookie']);
    const bodyToken = typeof request.body?.refreshToken === 'string' ? request.body.refreshToken : undefined;

    const contentType = this.header(request.headers['content-type']) ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      throw new UnauthorizedException('Refresh требует application/json');
    }

    let token: string;
    if (cookieToken !== undefined) {
      // TEC-02: cookie-транспорт защищён originates-проверкой (CSRF).
      const rawOrigin = this.header(request.headers['origin']);
      const origin = rawOrigin === undefined ? undefined : normalizeOrigin(rawOrigin);
      if (origin === undefined || !this.allowedOrigins().includes(origin)) {
        throw new UnauthorizedException('Недопустимый Origin для refresh cookie');
      }
      token = cookieToken;
    } else if (bodyToken !== undefined && bodyToken !== '') {
      // Body-fallback не использует cookie, поэтому CSRF через браузер
      // невозможен: злоумышленник не знает HttpOnly-cookie и токен из тела.
      token = bodyToken;
    } else {
      throw new UnauthorizedException('Refresh-токен не предоставлен');
    }

    const verified = await this.sessions.verifyRefreshAsync(token);
    request.refreshToken = token;
    request.refreshVerified = verified;
    request.auth = { sub: verified.payload.sub, jti: verified.payload.jti, sid: verified.payload.sid };
    return true;
  }

  /** Читает refresh-cookie из заголовка Cookie. */
  private readCookie(header: string | string[] | undefined): string | undefined {
    const raw = this.header(header);
    if (raw === undefined) {
      return undefined;
    }
    for (const part of raw.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === REFRESH_COOKIE_NAME) {
        return decodeURIComponent(rest.join('='));
      }
    }
    return undefined;
  }

  /** Приводит заголовок к строке. */
  private header(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  /** Канонические разрешённые origins; без дефолтов (fail-closed). */
  private allowedOrigins(): readonly string[] {
    const raw = this.config.get('AUTH_ALLOWED_ORIGINS', { infer: true });
    if (raw === undefined) {
      return [];
    }
    return raw
      .split(',')
      .map((item) => normalizeOrigin(item))
      .filter((item): item is string => item !== undefined);
  }
}
