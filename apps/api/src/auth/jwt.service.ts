// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Подпись и проверка JWT: строгая валидация заголовка и claims (SEC-01/SEC-02). */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { FORBIDDEN_SECRET_VALUES, parseDurationSeconds } from '../config/env.schema.js';
import type { Env } from '../config/env.schema.js';

/** Назначение токена. Разделение access/refresh — требование SEC-02-A. */
export type TokenType = 'access' | 'refresh';

/** Audience по типу токена: предотвращает кросс-использование. */
const TOKEN_AUDIENCE: Record<TokenType, string> = {
  access: 'vwc-api',
  refresh: 'vwc-auth',
};

/** Издатель всех токенов системы. */
const TOKEN_ISSUER = 'voltwirecraft-api';

/** Допустимый дрейф часов, секунды. */
const CLOCK_TOLERANCE_SECONDS = 30;

/** Структура полезной нагрузки. email и role намеренно отсутствуют (D-05). */
export interface JwtPayload {
  readonly sub: string;
  readonly typ: TokenType;
  readonly aud: string;
  readonly iss: string;
  readonly jti: string;
  readonly iat: number;
  readonly nbf: number;
  readonly exp: number;
}

/** Схема валидации payload на границе входа. */
const JwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  typ: z.enum(['access', 'refresh']),
  aud: z.string().min(1),
  iss: z.string().min(1),
  jti: z.string().uuid(),
  iat: z.number().int().positive(),
  nbf: z.number().int().positive(),
  exp: z.number().int().positive(),
});

/** Схема заголовка: только HS256 и JWT, kid обязателен. */
const JwtHeaderSchema = z.object({
  alg: z.literal('HS256'),
  typ: z.literal('JWT'),
  kid: z.string().min(1),
});

/**
 * HMAC-SHA256 JWT с жёсткой проверкой header, claims и назначения токена.
 *
 * TEC-04 (grace/keyring) не зафиксирован: сейчас поддерживается ровно один
 * активный ключ с `kid = JWT_KID`. Проверка `kid` обязательна; при появлении
 * previous-ключа логика расширяется без изменения публичного контракта.
 */
@Injectable()
export class JwtService {
  /** Секрет подписи, прочитанный один раз при создании сервиса. */
  private readonly secret: string;

  /** Текущий идентификатор ключа. */
  private readonly kid: string;

  public constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {
    const secret = this.config.get('JWT_SECRET', { infer: true });
    if (secret === undefined || secret.length < 32) {
      throw new Error('JWT_SECRET обязателен и должен содержать не менее 32 символов');
    }
    if (FORBIDDEN_SECRET_VALUES.some((forbidden) => secret.toLowerCase().includes(forbidden))) {
      throw new Error('JWT_SECRET не может быть публичным, default или dummy значением');
    }
    this.secret = secret;
    this.kid = this.config.get('JWT_KID', { infer: true });
  }

  /** Выдаёт access-токен (15 минут). */
  public signAccess(userId: string): string {
    return this.sign(userId, 'access', this.config.get('JWT_EXPIRES_IN', { infer: true }));
  }

  /** Выдаёт refresh-токен (30 дней). */
  public signRefresh(userId: string): string {
    return this.sign(userId, 'refresh', this.config.get('JWT_REFRESH_EXPIRES_IN', { infer: true }));
  }

  /**
   * Проверяет подпись, заголовок, claims и Lifetime токена.
   *
   * @throws {UnauthorizedException} при любом несоответствии — всегда 401,
   * никогда 500, включая битый base64/JSON.
   */
  public verify(token: string, expectedType: TokenType): JwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Некорректный формат токена');
    }
    const [headerPart, bodyPart, signature] = parts as [string, string, string];

    const parsedHeader = this.decodeJson(headerPart);
    const header = JwtHeaderSchema.safeParse(parsedHeader);
    if (!header.success || header.data.kid !== this.kid) {
      throw new UnauthorizedException('Недопустимый заголовок токена');
    }

    const expected = this.signData(`${headerPart}.${bodyPart}`);
    const actual = Buffer.from(signature, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    if (actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes)) {
      throw new UnauthorizedException('Недействительная подпись токена');
    }

    const parsedPayload = this.decodeJson(bodyPart);
    const payload = JwtPayloadSchema.safeParse(parsedPayload);
    if (!payload.success) {
      throw new UnauthorizedException('Некорректная полезная нагрузка токена');
    }

    const now = Math.floor(Date.now() / 1000);
    const data = payload.data;
    if (
      data.typ !== expectedType ||
      data.aud !== TOKEN_AUDIENCE[expectedType] ||
      data.iss !== TOKEN_ISSUER ||
      data.nbf > now + CLOCK_TOLERANCE_SECONDS ||
      data.exp + CLOCK_TOLERANCE_SECONDS <= now ||
      data.exp <= data.iat
    ) {
      throw new UnauthorizedException('Токен недействителен для данного назначения');
    }
    return data;
  }

  /** Безопасное разbase64url + парс JSON без исключений наружу. */
  private decodeJson(part: string): unknown {
    try {
      const json = Buffer.from(part, 'base64url').toString('utf8');
      return JSON.parse(json) as unknown;
    } catch {
      throw new UnauthorizedException('Некорректная кодировка токена');
    }
  }

  /** Подписывает payload с вычислением TTL. */
  private sign(userId: string, type: TokenType, expiresIn: string): string {
    const lifetime = parseDurationSeconds(expiresIn);
    if (!Number.isFinite(lifetime) || lifetime <= 0) {
      throw new Error('Некорректный TTL токена');
    }
    const now = Math.floor(Date.now() / 1000);
    const body: JwtPayload = {
      sub: userId,
      typ: type,
      aud: TOKEN_AUDIENCE[type],
      iss: TOKEN_ISSUER,
      jti: randomUUID(),
      iat: now,
      nbf: now,
      exp: now + lifetime,
    };
    const encodedHeader = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: this.kid }),
    ).toString('base64url');
    const encodedBody = Buffer.from(JSON.stringify(body)).toString('base64url');
    const signature = this.signData(`${encodedHeader}.${encodedBody}`);
    return `${encodedHeader}.${encodedBody}.${signature}`;
  }

  /** Вычисляет HMAC подпись в base64url. */
  private signData(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('base64url');
  }
}

/** Роль пользователя, совместимая с ролью проекта. */
export type UserRole = 'user' | 'admin';
