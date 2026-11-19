import { Global, Injectable, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.schema.js';

/** Токен внедрения клиента Redis. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Клиент Redis с жёстким таймаутом подключения и корректным завершением. */
@Injectable()
export class RedisService extends Redis implements OnApplicationShutdown {
  /**
   * @param config — валидированная конфигурация приложения.
   */
  public constructor(config: ConfigService<Env, true>) {
    super(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
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
