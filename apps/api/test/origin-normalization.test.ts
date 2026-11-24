// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** F-11: каноническое сравнение Origin для cookie-refresh. */

import 'reflect-metadata';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RefreshGuard } from '../src/auth/refresh.guard.js';
import type { RefreshSessionService } from '../src/auth/refresh-session.service.js';

function guardFor(allowed: string): RefreshGuard {
  const config = {
    get: (key: string): unknown => (key === 'AUTH_ALLOWED_ORIGINS' ? allowed : undefined),
  };
  const sessions = {
    verifyRefreshAsync: vi.fn(async () => ({ payload: { sub: 'u' } })),
  } as unknown as RefreshSessionService;
  return new RefreshGuard(sessions, config as never);
}

function contextFor(origin?: string): ExecutionContext {
  const headers: Record<string, string> = {
    cookie: 'vwc_refresh=token',
    'content-type': 'application/json',
  };
  if (origin !== undefined) {
    headers['origin'] = origin;
  }
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('F-11 — Origin normalization', () => {
  it('trailing slash и регистр hostname не блокируют cookie-refresh', async () => {
    await expect(guardFor('https://Example.com/').canActivate(contextFor('https://example.com'))).resolves.toBe(true);
  });

  it('стандартный порт в конфигурации эквивалентен порту по умолчанию', async () => {
    await expect(
      guardFor('https://example.com:443/').canActivate(contextFor('https://example.com')),
    ).resolves.toBe(true);
  });

  it('нестандартный порт должен совпадать точно', async () => {
    await expect(
      guardFor('https://example.com:8443').canActivate(contextFor('https://example.com:8443')),
    ).resolves.toBe(true);
    await expect(
      guardFor('https://example.com:8443').canActivate(contextFor('https://example.com')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    'https://evil.example.com',
    'https://sub.example.com',
    'https://example.com.evil.test',
    'https://example.com/path',
    'null',
    '*',
  ])('запрещённый Origin %s отвергается', async (origin) => {
    await expect(
      guardFor('https://example.com').canActivate(contextFor(origin)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('отсутствующий Origin fail-closed', async () => {
    await expect(guardFor('https://example.com').canActivate(contextFor())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
