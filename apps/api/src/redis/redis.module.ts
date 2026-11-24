import { once } from 'node:events';
import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.schema.js';

/** Токен внедрения клиента Redis. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Клиент Redis с жёстким таймаутом подключения и корректным завершением. */
@Injectable()
export class RedisService extends Redis implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  /** Ожидание готовности limiter'а до приёма защищённого трафика. */
  private static readonly READY_TIMEOUT_MS = 5000;

  /**
   * @param config — валидированная конфигурация приложения.
   */
  public constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    super(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
  }

  /**
   * F-09: явно подключает Redis и ждёт события `ready`. Вызывается до
   * `app.listen()`, чтобы первый защищённый запрос не получал ложный 429.
   * Сообщения об ошибке не содержат адрес, пароль или другие секреты.
   */
  public async ensureReadyAsync(): Promise<void> {
    if (this.status === 'ready') {
      return;
    }
    try {
      if (this.status === 'wait' || this.status === 'end' || this.status === 'close') {
        await this.connect();
      }
      const state: string = this.status;
      if (state !== 'ready') {
        await Promise.race([
          once(this, 'ready'),
          new Promise<never>((_resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error('Redis readiness timeout')),
              RedisService.READY_TIMEOUT_MS,
            );
            timer.unref();
          }),
        ]);
      }
    } catch {
      this.logger.error('Redis limiter is not ready; refusing to serve protected traffic');
      throw new Error('Redis limiter is not ready');
    }
  }

  /** Разрывает соединение с Redis при завершении работы (RULES § 4.12). */
  public onApplicationShutdown(): void {
    if (this.status !== 'end') {
      this.disconnect();
    }
  }
}

/** Глобальный модуль доступа к Redis. */
@Global()
@Module({
  providers: [RedisService, { provide: REDIS_CLIENT, useExisting: RedisService }],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
