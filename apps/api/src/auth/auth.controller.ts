// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Эндпоинты регистрации, входа, refresh и завершения сессий. */

import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoginDtoSchema, RegisterDtoSchema } from '@voltwirecraft/shared/graph.schema.js';
import type { LoginDto, RegisterDto } from '@voltwirecraft/shared/graph.schema.js';
import type { ApiResponse } from '../common/api-response.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { parseDurationSeconds } from '../config/env.schema.js';
import type { Env } from '../config/env.schema.js';
import { AuthService, type AuthUser } from './auth.service.js';
import { CurrentUser, type AuthenticatedRequest } from './auth.guard.js';
import { Public } from './public.decorator.js';
import { RefreshAuth } from './refresh-auth.decorator.js';
import { REFRESH_COOKIE_NAME, type RefreshRequest } from './refresh.guard.js';
import { RefreshSessionService } from './refresh-session.service.js';

/** Минимальный контракт Express Response, необходимый для refresh-cookie. */
interface CookieResponse {
  cookie(
    name: string,
    value: string,
    options: {
      readonly httpOnly: boolean;
      readonly secure: boolean;
      readonly sameSite: 'strict';
      readonly path: string;
      readonly maxAge?: number;
    },
  ): unknown;
  clearCookie(
    name: string,
    options: {
      readonly httpOnly: boolean;
      readonly secure: boolean;
      readonly sameSite: 'strict';
      readonly path: string;
    },
  ): unknown;
}

/** Публичные и защищённые эндпоинты авторизации. */
@Controller('auth')
export class AuthController {
  public constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RefreshSessionService) private readonly sessions: RefreshSessionService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Регистрирует пользователя. PO-D01: публичный.
   */
  @Post('register')
  @Public()
  public async registerAsync(
    @Body(new ZodValidationPipe(RegisterDtoSchema)) dto: RegisterDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<ApiResponse<Awaited<ReturnType<AuthService['registerAsync']>>>> {
    const data = await this.auth.registerAsync(dto);
    this.setRefreshCookie(response, data.refreshToken);
    return { success: true, data, message: 'Пользователь зарегистрирован' };
  }

  /**
   * Выполняет вход. PO-D01: публичный.
   */
  @Post('login')
  @Public()
  public async loginAsync(
    @Body(new ZodValidationPipe(LoginDtoSchema)) dto: LoginDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<ApiResponse<Awaited<ReturnType<AuthService['loginAsync']>>>> {
    const data = await this.auth.loginAsync(dto);
    this.setRefreshCookie(response, data.refreshToken);
    return { success: true, data, message: 'Вход выполнен' };
  }

  /**
   * Обновляет пару токенов. НЕ публичный: отдельная refresh-проверка.
   */
  @Post('refresh')
  @HttpCode(200)
  @RefreshAuth()
  public async refreshAsync(
    @Req() request: RefreshRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> {
    const token = request.refreshToken;
    if (token === undefined) {
      throw new UnauthorizedException('Refresh-токен не предоставлен');
    }
    const tokens = await this.sessions.rotateAsync(token);
    this.setRefreshCookie(response, tokens.refreshToken);
    return {
      success: true,
      data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
      message: 'Токены обновлены',
    };
  }

  /**
   * Возвращает текущего пользователя по JWT. PO-D01: закрыт.
   */
  @Get('me')
  public async meAsync(@CurrentUser() user: AuthUser): Promise<ApiResponse<AuthUser>> {
    const data = await this.auth.meAsync(user.id);
    return { success: true, data, message: 'Пользователь получен' };
  }

  /** Отзывает текущую сессию (sid из access-токена). */
  @Post('logout')
  @HttpCode(200)
  public async logoutAsync(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<ApiResponse<{ revoked: true }>> {
    const sid = request.auth?.sid;
    if (sid === undefined) {
      throw new UnauthorizedException('Сессия не определена');
    }
    await this.sessions.revokeAsync(sid);
    this.clearRefreshCookie(response);
    return { success: true, data: { revoked: true }, message: 'Сессия завершена' };
  }

  /** Отзывает все активные сессии пользователя. */
  @Post('logout-all')
  @HttpCode(200)
  public async logoutAllAsync(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<ApiResponse<{ revoked: true }>> {
    await this.sessions.revokeAllAsync(user.id);
    this.clearRefreshCookie(response);
    return { success: true, data: { revoked: true }, message: 'Все сессии завершены' };
  }

  /** Устанавливает HttpOnly/Secure/SameSite=Strict cookie с refresh-токеном. */
  private setRefreshCookie(response: CookieResponse, token: string): void {
    const ttlSeconds = parseDurationSeconds(
      this.config.get('JWT_REFRESH_EXPIRES_IN', { infer: true }),
    );
    response.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/auth',
      maxAge: Number.isFinite(ttlSeconds) ? ttlSeconds * 1000 : undefined,
    });
  }

  /** Удаляет refresh-cookie (те же атрибуты path/sameSite). */
  private clearRefreshCookie(response: CookieResponse): void {
    response.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/auth',
    });
  }
}


