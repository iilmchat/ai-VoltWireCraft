// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** F-09: Redis readiness до приёма защищённого трафика и reconnect. */

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RedisService } from '../src/redis/redis.module.js';

const REDIS_URL = process.env['VWC_REDIS_URL'];

function serviceFor(url: string): RedisService {
  return new RedisService({
    get: (key: string): unknown => (key === 'REDIS_URL' ? url : undefined),
  } as never);
}

describe('F-09 — Redis readiness', () => {
  it('недоступный Redis при старте не объявляет readiness и не раскрывает адрес', async () => {
    const service = serviceFor('redis://127.0.0.1:1');
    try {
      await expect(service.ensureReadyAsync()).rejects.toThrow(/not ready/);
      const message = await service.ensureReadyAsync().catch((error: unknown) =>
        error instanceof Error ? error.message : String(error),
      );
      expect(message).not.toContain('127.0.0.1');
      expect(message).not.toContain('redis://');
    } finally {
      service.disconnect();
    }
  });

  it.skipIf(REDIS_URL === undefined)('первый запрос после readiness проходит, reconnect восстанавливает limiter', async () => {
    const service = serviceFor(REDIS_URL as string);
    const key = `vwc:readiness:${randomUUID()}`;
    try {
      await service.ensureReadyAsync();
      expect(await service.eval('return redis.call("INCR", KEYS[1])', 1, key)).toBe(1);
      service.disconnect();
      // ioredis меняет status на 'end' асинхронно после disconnect().
      await new Promise((resolve) => setTimeout(resolve, 50));
      await service.ensureReadyAsync();
      expect(Number(await service.eval('return redis.call("INCR", KEYS[1])', 1, key))).toBe(2);
    } finally {
      service.disconnect();
    }
  });
});
