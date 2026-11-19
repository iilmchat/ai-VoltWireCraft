import { Global, Injectable, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { Env } from '../config/env.schema.js';

/** Токен внедрения пула PostgreSQL. */
export const PG_POOL = Symbol('PG_POOL');

/** Пул соединений PostgreSQL с корректным закрытием при завершении работы. */
@Injectable()
export class PgPoolService extends Pool implements OnApplicationShutdown {
  /**
   * @param config — валидированная конфигурация приложения.
   */
  public constructor(config: ConfigService<Env, true>) {
    super({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: 5,
      connectionTimeoutMillis: 3000,
    });
  }

  /** Закрывает пул соединений (RULES § 4.12). */
  public async onApplicationShutdown(): Promise<void> {
    await this.end();
  }
}

/** Глобальный модуль доступа к PostgreSQL. */
@Global()
@Module({
  providers: [PgPoolService, { provide: PG_POOL, useExisting: PgPoolService }],
  exports: [PG_POOL],
})
export class DatabaseModule {}
