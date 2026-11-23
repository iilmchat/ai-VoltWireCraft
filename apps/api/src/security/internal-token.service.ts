// © 2026 VoltWireCraft — Security Architect / TEC-06
/**
 * Криптографическая основа service-to-service аутентификации API → MCP/calc-engine.
 *
 * Не является JWT: отдельный формат исключает путаницу с access/refresh.
 * Входящая проверка на стороне FastAPI (require_internal_token) реализуется
 * в этапе 4; здесь задаётся совместимый контракт issuer/audience/подписи.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';

/** Payload внутреннего токена. */
export interface InternalTokenPayload {
  readonly typ: 'internal-service';
  readonly iss: 'voltwirecraft-api';
  readonly sub: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

/** Проверенный внутренний токен. */
export type VerifiedInternalToken = InternalTokenPayload;

/** Максимальный TTL внутреннего токена: 5 минут. */
const MAX_TTL_SECONDS = 300;

/** Допустимый дрейф часов. */
const CLOCK_SKEW_SECONDS = 30;

@Injectable()
export class InternalTokenService {
  private readonly key: string;

  public constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    const key = config.get('INTERNAL_SERVICE_TOKEN', { infer: true });
    if (key === undefined || key.length < 32) {
      throw new Error('INTERNAL_SERVICE_TOKEN обязателен (TEC-06)');
    }
    this.key = key;
  }

  /** Выпускает токен для конкретного внутреннего сервиса. */
  public sign(service: string, audience: string, ttlSeconds = MAX_TTL_SECONDS): string {
    if (ttlSeconds <= 0 || ttlSeconds > MAX_TTL_SECONDS) {
      throw new Error('Недопустимый TTL внутреннего токена');
    }
    const now = Math.floor(Date.now() / 1000);
    const payload: InternalTokenPayload = {
      typ: 'internal-service',
      iss: 'voltwirecraft-api',
      sub: service,
      aud: audience,
      iat: now,
      exp: now + ttlSeconds,
      jti: randomUUID(),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.signData(body)}`;
  }

  /** Проверяет подпись, назначение и срок действия. */
  public verify(token: string, expectedAudience: string): VerifiedInternalToken {
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Некорректный внутренний токен');
    }
    const [body, signature] = parts as [string, string];
    const expected = this.signData(body);
    const actualBytes = Buffer.from(signature, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
      throw new UnauthorizedException('Недействительная подпись внутреннего токена');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
    } catch {
      throw new UnauthorizedException('Некорректный payload внутреннего токена');
    }

    const now = Math.floor(Date.now() / 1000);
    const candidate = parsed as Partial<InternalTokenPayload> | null;
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      candidate.typ !== 'internal-service' ||
      candidate.iss !== 'voltwirecraft-api' ||
      candidate.aud !== expectedAudience ||
      typeof candidate.sub !== 'string' ||
      typeof candidate.jti !== 'string' ||
      typeof candidate.iat !== 'number' ||
      typeof candidate.exp !== 'number' ||
      candidate.exp + CLOCK_SKEW_SECONDS <= now ||
      candidate.exp <= candidate.iat
    ) {
      throw new UnauthorizedException('Внутренний токен недействителен');
    }
    return candidate as InternalTokenPayload;
  }

  /** HMAC подпись. */
  private signData(data: string): string {
    return createHmac('sha256', this.key).update(data).digest('base64url');
  }
}
