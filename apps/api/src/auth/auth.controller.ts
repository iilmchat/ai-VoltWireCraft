// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Эндпоинты регистрации, входа и текущего пользователя. */

import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { LoginDtoSchema, RegisterDtoSchema } from '@voltwirecraft/shared/graph.schema.js';
import type { LoginDto, RegisterDto } from '@voltwirecraft/shared/graph.schema.js';
import type { ApiResponse } from '../common/api-response.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService, type AuthUser } from './auth.service.js';
import { CurrentUser } from './auth.guard.js';

/** Публичные и защищённые эндпоинты авторизации. */
@Controller('auth')
export class AuthController {
  /**
   * @param auth — сервис авторизации.
   */
  public constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /**
   * Регистрирует пользователя.
   *
   * @param dto — email, пароль и имя.
   * @returns токены и данные пользователя.
   */
  @Post('register')
  public async registerAsync(
    @Body(new ZodValidationPipe(RegisterDtoSchema)) dto: RegisterDto,
  ): Promise<ApiResponse<Awaited<ReturnType<AuthService['registerAsync']>>>> {
    const data = await this.auth.registerAsync(dto);
    return { success: true, data, message: 'Пользователь зарегистрирован' };
  }

  /**
   * Выполняет вход.
   *
   * @param dto — email и пароль.
   * @returns токены и данные пользователя.
   */
  @Post('login')
  public async loginAsync(
    @Body(new ZodValidationPipe(LoginDtoSchema)) dto: LoginDto,
  ): Promise<ApiResponse<Awaited<ReturnType<AuthService['loginAsync']>>>> {
    const data = await this.auth.loginAsync(dto);
    return { success: true, data, message: 'Вход выполнен' };
  }

  /**
   * Возвращает текущего пользователя по JWT.
   *
   * @param user — пользователь из токена.
   * @returns данные пользователя.
   */
  @Get('me')
  public async meAsync(@CurrentUser() user: AuthUser): Promise<ApiResponse<AuthUser>> {
    const data = await this.auth.meAsync(user.id);
    return { success: true, data, message: 'Пользователь получен' };
  }
}
