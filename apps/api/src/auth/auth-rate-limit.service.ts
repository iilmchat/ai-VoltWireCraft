// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** F-03: разделительный rate limiter для чувствительных auth-операций. */

import { createHash, createHmac } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.schema.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

/** Операции, подлежащие ограничению. */
export type AuthRateLimitOperation = 'login' | 'refresh' | 'logout';

/**
 * Инкремент с TTL в одном Lua-вызове: счётчик и срок жизни создаются
 * атомарно. Общий Redis делает лимит согласованным между инстансами API.
 */
const INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return current
`;

/** Унифицированный ответ без раскрытия состояния учётной записи. */
const LIMIT_MESSAGE = 'Слишком много запросов. Повторите позже.';

@Injectable()
export class AuthRateLimitService {
  /** Только для unit-тестов: в production используется общий Redis. */
  private readonly memory = new Map<string, { value: number; expiresAt: number }>();
  private readonly useMemory: boolean;
  private readonly accountKey: string;

  public constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {
    // Тестовый раннер не поднимает Redis; production-значение NODE_ENV не 'test'.
    this.useMemory = this.config.get('NODE_ENV', { infer: true }) === 'test';
    const dedicated = this.config.get('AUTH_RATE_LIMIT_ACCOUNT_KEY', { infer: true });
    this.accountKey = dedicated ?? this.config.get('JWT_SECRET', { infer: true });
  }

  /**
   * Проверяет лимит для операции и идентификатора клиента.
   * Любая ошибка хранилища — fail-closed (429), доступ не предоставляется.
   */
  public async checkAsync(operation: AuthRateLimitOperation, identity: string): Promise<void> {
    const keys = {
      login: {
        max: 'AUTH_RATE_LIMIT_LOGIN_MAX',
        window: 'AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS',
      },
      refresh: {
        max: 'AUTH_RATE_LIMIT_REFRESH_MAX',
        window: 'AUTH_RATE_LIMIT_REFRESH_WINDOW_SECONDS',
      },
      logout: {
        max: 'AUTH_RATE_LIMIT_LOGOUT_MAX',
        window: 'AUTH_RATE_LIMIT_LOGOUT_WINDOW_SECONDS',
      },
    } as const;
    const max = this.config.get(keys[operation].max, { infer: true });
    const windowSeconds = this.config.get(keys[operation].window, { infer: true });
    const key = `vwc:auth:rate:${operation}:${createHash('sha256').update(identity).digest('hex')}`;
    await this.consumeAsync(key, windowSeconds, max);
  }

  /**
   * F-10: дополнительный bucket на аккаунт. Email не попадает в ключ —
   * используется HMAC с устойчивым общим секретом. Бакет применяется и к
   * несуществующим аккаунтам, чтобы ответ не раскрывал их наличие.
   */
  public async checkAccountAsync(normalizedLogin: string): Promise<void> {
    const max = this.config.get('AUTH_RATE_LIMIT_ACCOUNT_MAX', { infer: true });
    const windowSeconds = this.config.get('AUTH_RATE_LIMIT_ACCOUNT_WINDOW_SECONDS', { infer: true });
    const accountId = createHmac('sha256', this.accountKey)
      .update(normalizedLogin)
      .digest('hex');
    const key = `vwc:auth:rate:login-account:${accountId}`;
    await this.consumeAsync(key, windowSeconds, max);
  }

  /** Единственная точка потребления счётчика и fail-closed обработки. */
  private async consumeAsync(key: string, windowSeconds: number, max: number): Promise<void> {
    try {
      const current = this.useMemory
        ? this.incrementMemory(key, windowSeconds)
        : Number(await this.redis.eval(INCREMENT_SCRIPT, 1, key, String(windowSeconds)));
      if (current > max) {
        throw new HttpException(LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (error: unknown) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw error;
      }
      // Redis недоступен — безопаснее отказать, чем разрешить неограниченный доступ.
      throw new HttpException(LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Счётчик только для unit-тестов без Redis. */
  private incrementMemory(key: string, windowSeconds: number): number {
    const now = Date.now();
    const current = this.memory.get(key);
    if (current !== undefined && current.expiresAt <= now) {
      this.memory.delete(key);
    }
    const next = (this.memory.get(key)?.value ?? 0) + 1;
    this.memory.set(key, { value: next, expiresAt: now + windowSeconds * 1000 });
    return next;
  }
}
