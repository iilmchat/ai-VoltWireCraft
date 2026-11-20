// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Подпись и проверка JWT на `node:crypto` без внешних зависимостей. */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ProjectRole } from '@voltwirecraft/shared/graph.schema.js';
import type { Env } from '../config/env.schema.js';

/** Полезная нагрузка токена. */
export interface JwtPayload {
  /** Идентификатор пользователя. */
  readonly sub: string;
  /** Email пользователя. */
  readonly email: string;
  /** Глобальная роль. */
  readonly role: 'user' | 'admin';
  /** Время окончания, Unix-секунды. */
  readonly exp: number;
}

/**
 * HMAC-SHA256 JWT: заголовок и полезная нагрузка кодируются в base64url,
 * подпись сверяется в константное время.
 */
@Injectable()
export class JwtService {
  /**
   * @param config — валидированная конфигурация.
   */
  public constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  /**
   * Выдаёт access- или refresh-токен.
   *
   * @param payload — данные пользователя без `exp`.
   * @param expiresIn — строка вида `7d`, `15m`, `3600s`.
   * @returns подписанный JWT.
   */
  public sign(
    payload: Omit<JwtPayload, 'exp'>,
    expiresIn: string = this.config.get('JWT_EXPIRES_IN', { infer: true }),
  ): string {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (match === null) {
      throw new Error('Некорректный формат JWT_EXPIRES_IN');
    }
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };
    const lifetime = Number(match[1]) * multipliers[match[2]!]!;
    const body: JwtPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + lifetime };
    const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const encodedBody = Buffer.from(JSON.stringify(body)).toString('base64url');
    const signature = this.signData(`${encodedHeader}.${encodedBody}`);
    return `${encodedHeader}.${encodedBody}.${signature}`;
  }

  /**
   * Проверяет подпись и срок действия токена.
   *
   * @param token — JWT.
   * @returns полезная нагрузка.
   * @throws {UnauthorizedException} если токен недействителен.
   */
  public verify(token: string): JwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Некорректный формат токена');
    }
    const [header, body, signature] = parts as [string, string, string];
    const expected = this.signData(`${header}.${body}`);
    if (
      expected.length !== signature.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    ) {
      throw new UnauthorizedException('Недействительная подпись токена');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Срок действия токена истёк');
    }
    return payload;
  }

  /**
   * Вычисляет HMAC подпись.
   *
   * @param data — подписываемые данные.
   * @returns base64url подписи.
   */
  private signData(data: string): string {
    return createHmac('sha256', this.config.get('JWT_SECRET', { infer: true }))
      .update(data)
      .digest('base64url');
  }
}

/** Роль пользователя, совместимая с ролью проекта. */
export type UserRole = ProjectRole | 'user' | 'admin';
