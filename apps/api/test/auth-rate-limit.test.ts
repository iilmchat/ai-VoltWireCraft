// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** F-03: rate limiting для auth-операций и устойчивость к подмене заголовков. */

import 'reflect-metadata';
import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthRateLimitService, type AuthRateLimitOperation } from '../src/auth/auth-rate-limit.service.js';
import { REFRESH_AUTH_KEY } from '../src/auth/refresh-auth.decorator.js';
import { SecurityGuard } from '../src/auth/security.guard.js';
import type { JwtAuthGuard } from '../src/auth/auth.guard.js';
import type { ProjectAccessGuard } from '../src/auth/project-access.guard.js';
import type { RefreshGuard } from '../src/auth/refresh.guard.js';

class FakeRedis {
  private readonly counters = new Map<string, { value: number; expiresAt: number }>();

  public async eval(_script: string, _keys: number, key: string, window: string): Promise<number> {
    const now = Date.now();
    const current = this.counters.get(key);
    if (current !== undefined && current.expiresAt <= now) {
      this.counters.delete(key);
    }
    const next = (this.counters.get(key)?.value ?? 0) + 1;
    this.counters.set(key, {
      value: next,
      expiresAt: now + Number(window) * 1000,
    });
    return next;
  }
}

function rateLimitService(redis: FakeRedis, max = 2): AuthRateLimitService {
  const config = {
    get: (key: string): unknown => {
      if (key === 'JWT_SECRET') return 'account-key-for-tests-0123456789abcdef';
      if (key.endsWith('_MAX')) return max;
      if (key.endsWith('_WINDOW_SECONDS')) return 60;
      return undefined;
    },
  };
  return new AuthRateLimitService(
    redis as unknown as Redis,
    config as never,
  );
}

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('F-03 — auth rate limiting', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('превышение лимита возвращает 429', async () => {
    const service = rateLimitService(new FakeRedis());
    await expect(service.checkAsync('login', 'client-a')).resolves.toBeUndefined();
    await expect(service.checkAsync('login', 'client-a')).resolves.toBeUndefined();
    const error = await service.checkAsync('login', 'client-a').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
  });

  it('восстановление после окна', async () => {
    vi.useFakeTimers();
    const service = rateLimitService(new FakeRedis());
    await service.checkAsync('login', 'client-a');
    await service.checkAsync('login', 'client-a');
    await expect(service.checkAsync('login', 'client-a')).rejects.toBeInstanceOf(HttpException);

    vi.setSystemTime(Date.now() + 61_000);
    await expect(service.checkAsync('login', 'client-a')).resolves.toBeUndefined();
  });

  it('лимиты независимы для операций и клиентов', async () => {
    const service = rateLimitService(new FakeRedis());
    await service.checkAsync('login', 'client-a');
    await service.checkAsync('login', 'client-a');
    await expect(service.checkAsync('login', 'client-a')).rejects.toBeInstanceOf(HttpException);
    await expect(service.checkAsync('refresh', 'client-a')).resolves.toBeUndefined();
    await expect(service.checkAsync('login', 'client-b')).resolves.toBeUndefined();
  });

  it('ошибка Redis fail-closed', async () => {
    const broken = {
      eval: async () => {
        throw new Error('redis down');
      },
    } as unknown as Redis;
    const service = new AuthRateLimitService(broken, {
      get: (key: string): unknown => (key.endsWith('_MAX') ? 10 : 60),
    } as never);
    await expect(service.checkAsync('logout', 'client-a')).rejects.toBeInstanceOf(HttpException);
  });

  it('SecurityGuard использует req.ip и игнорирует X-Forwarded-For', async () => {
    const checkAsync = vi.fn(async (_operation: AuthRateLimitOperation, _identity: string) => undefined);
    const guard = new SecurityGuard(
      { canActivate: async () => true } as unknown as JwtAuthGuard,
      { canActivate: async () => true } as unknown as ProjectAccessGuard,
      { canActivate: async () => true } as unknown as RefreshGuard,
      new Reflector(),
      { checkAsync } as unknown as AuthRateLimitService,
    );
    const context = contextFor({
      url: '/auth/login',
      method: 'POST',
      ip: '203.0.113.7',
      headers: { 'x-forwarded-for': '198.51.100.9' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(checkAsync).toHaveBeenCalledWith('login', '203.0.113.7');
  });

  it('refresh без access Bearer проходит через отдельную ветку лимитера', async () => {
    const checkAsync = vi.fn(async (_operation: AuthRateLimitOperation, _identity: string) => undefined);
    const guard = new SecurityGuard(
      { canActivate: async () => { throw new Error('JWT guard не должен вызываться'); } } as unknown as JwtAuthGuard,
      { canActivate: async () => { throw new Error('Project guard не должен вызываться'); } } as unknown as ProjectAccessGuard,
      { canActivate: async () => true } as unknown as RefreshGuard,
      new Reflector(),
      { checkAsync } as unknown as AuthRateLimitService,
    );
    const handler = () => undefined;
    Reflect.defineMetadata(REFRESH_AUTH_KEY, true, handler);
    const context = {
      getClass: () => class TestController {},
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({
          url: '/auth/refresh',
          method: 'POST',
          ip: '203.0.113.8',
          headers: {},
          auth: { sub: 'u-1' },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(checkAsync).toHaveBeenCalledWith('refresh', '203.0.113.8');
    expect(checkAsync).toHaveBeenCalledWith('refresh', 'u-1');
  });

  it('F-10: per-account bucket ограничивает один аккаунт с разных IP', async () => {
    const redis = new FakeRedis();
    const service = rateLimitService(redis, 2);
    await expect(service.checkAccountAsync('owner@example.com')).resolves.toBeUndefined();
    await expect(service.checkAccountAsync('owner@example.com')).resolves.toBeUndefined();
    await expect(service.checkAccountAsync('owner@example.com')).rejects.toBeInstanceOf(HttpException);
    await expect(service.checkAccountAsync('other@example.com')).resolves.toBeUndefined();
  });

  it('F-10: account bucket восстанавливается после окна', async () => {
    vi.useFakeTimers();
    const service = rateLimitService(new FakeRedis(), 2);
    await service.checkAccountAsync('owner@example.com');
    await service.checkAccountAsync('owner@example.com');
    await expect(service.checkAccountAsync('owner@example.com')).rejects.toBeInstanceOf(HttpException);
    vi.setSystemTime(Date.now() + 901_000);
    await expect(service.checkAccountAsync('owner@example.com')).resolves.toBeUndefined();
  });

  it('F-10: два инстанса делят account bucket через общий Redis', async () => {
    const redis = new FakeRedis();
    const first = rateLimitService(redis, 2);
    const second = rateLimitService(redis, 2);
    await first.checkAccountAsync('victim@example.com');
    await second.checkAccountAsync('victim@example.com');
    await expect(first.checkAccountAsync('victim@example.com')).rejects.toBeInstanceOf(HttpException);
  });

  it('F-10: SecurityGuard нормализует email до account bucket', async () => {
    const checkAccountAsync = vi.fn(async (_email: string) => undefined);
    const guard = new SecurityGuard(
      { canActivate: async () => true } as unknown as JwtAuthGuard,
      { canActivate: async () => true } as unknown as ProjectAccessGuard,
      { canActivate: async () => true } as unknown as RefreshGuard,
      new Reflector(),
      {
        checkAsync: vi.fn(async () => undefined),
        checkAccountAsync,
      } as unknown as AuthRateLimitService,
    );
    const context = contextFor({
      url: '/auth/login',
      method: 'POST',
      ip: '203.0.113.9',
      headers: {},
      body: { email: 'Owner@Example.COM' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(checkAccountAsync).toHaveBeenCalledWith('owner@example.com');
  });

  it('F-10: Redis outage для account bucket остаётся fail-closed', async () => {
    const broken = {
      eval: async () => {
        throw new Error('redis down');
      },
    } as unknown as Redis;
    const service = new AuthRateLimitService(broken, {
      get: (key: string): unknown => {
        if (key === 'JWT_SECRET') return 'account-key-for-tests-0123456789abcdef';
        if (key === 'AUTH_RATE_LIMIT_ACCOUNT_KEY') return undefined;
        return key.endsWith('_MAX') ? 10 : 60;
      },
    } as never);
    await expect(service.checkAccountAsync('owner@example.com')).rejects.toBeInstanceOf(HttpException);
  });
});
