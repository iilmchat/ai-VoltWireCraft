import { Inject, Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import type { Env } from '../config/env.schema.js';
import { PG_POOL } from '../database/database.module.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { APP_VERSION } from '../version.js';
import type { HealthReport, ServiceHealth, ServiceName } from './health.types.js';

const CHECK_TIMEOUT_MS = 3000;

/**
 * Преобразует результат независимой проверки в структуру отчёта.
 *
 * @param name — имя сервиса.
 * @param result — результат `Promise.allSettled`.
 * @returns описание состояния сервиса.
 */
function toServiceHealth(name: ServiceName, result: PromiseSettledResult<void>): ServiceHealth {
  if (result.status === 'fulfilled') {
    return { name, status: 'ok' };
  }
  return { name, status: 'error', detail: String(result.reason) };
}

/** Сервис проверки доступности PostgreSQL, Redis и расчётного ядра. */
@Injectable()
export class HealthService {
  /**
   * @param pg — пул соединений PostgreSQL.
   * @param redis — клиент Redis.
   * @param config — валидированная конфигурация приложения.
   */
  public constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Выполняет проверки параллельно: отказ одного сервиса не роняет остальные
   * (RULES § 4.13).
   *
   * @returns сводный отчёт о готовности.
   */
  public async checkAsync(): Promise<HealthReport> {
    const [postgres, redis, calcEngine] = await Promise.allSettled([
      this.checkPostgresAsync(),
      this.checkRedisAsync(),
      this.checkCalcEngineAsync(),
    ]);

    const services: ServiceHealth[] = [
      toServiceHealth('postgres', postgres),
      toServiceHealth('redis', redis),
      toServiceHealth('calcEngine', calcEngine),
    ];

    return {
      status: services.every((service) => service.status === 'ok') ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      services,
    };
  }

  /** Проверяет PostgreSQL через короткий запрос `SELECT 1`. */
  private async checkPostgresAsync(): Promise<void> {
    const client = await this.pg.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  /** Проверяет Redis командой `PING`. */
  private async checkRedisAsync(): Promise<void> {
    const response: unknown = await this.redis.ping();
    if (response !== 'PONG') {
      throw new Error('Redis вернул неожиданный ответ на PING');
    }
  }

  /** Проверяет расчётное ядро с таймаутом и `AbortController` (RULES § 4.14–4.15). */
  private async checkCalcEngineAsync(): Promise<void> {
    const url = new URL('/health', this.config.get('CALC_ENGINE_URL', { infer: true }));
    const controller = new AbortController();
    const timeout: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Расчётное ядро вернуло HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
