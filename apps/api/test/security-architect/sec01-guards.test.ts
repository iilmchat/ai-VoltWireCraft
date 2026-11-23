// © 2026 VoltWireCraft — Security Architect / SEC-01 + этап 0
/** Тесты механизма @Public, порядка APP_GUARD и redaction логов. */

import 'reflect-metadata';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthModule } from '../../src/auth/auth.module.js';
import { JwtAuthGuard, type AuthenticatedRequest } from '../../src/auth/auth.guard.js';
import { Public } from '../../src/auth/public.decorator.js';
import { JwtService } from '../../src/auth/jwt.service.js';
import type { AuthUser } from '../../src/auth/auth.service.js';
import {
  AllExceptionsFilter,
  sanitizeLogValue,
} from '../../src/common/all-exceptions.filter.js';
import type { Env } from '../../src/config/env.schema.js';

/** Фиктивный контроллер для проверки Reflector (метаданные задаются напрямую). */
class FakeController {
  public publicRoute(): void {
    return;
  }

  public protectedRoute(): void {
    return;
  }
}

Public()(
  FakeController.prototype,
  'publicRoute',
  Object.getOwnPropertyDescriptor(FakeController.prototype, 'publicRoute')!,
);

function contextFor(
  handler: () => void,
  request: AuthenticatedRequest,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const user: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@sec.test',
  displayName: 'Owner',
  role: 'user',
};

describe('SEC-01 / этап 0 — глобальные guards', () => {
  it('@Public пропускает запрос без Bearer-токена', async () => {
    const guard = new JwtAuthGuard(
      {} as JwtService,
      {} as never,
      new Reflector(),
    );
    const request: AuthenticatedRequest = { headers: {} };

    await expect(
      guard.canActivate(contextFor(FakeController.prototype.publicRoute!, request)),
    ).resolves.toBe(true);
  });

  it('защищённый маршрут без токена → UnauthorizedException', async () => {
    const guard = new JwtAuthGuard(
      {} as JwtService,
      {} as never,
      new Reflector(),
    );
    const request: AuthenticatedRequest = { headers: {} };

    await expect(
      guard.canActivate(contextFor(FakeController.prototype.protectedRoute, request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('пользователь и role загружаются из БД, а не из payload', async () => {
    const jwt = {
      verify: vi.fn(() => ({ sub: user.id, jti: 'jti-1', typ: 'access' })),
    } as unknown as JwtService;
    const auth = { meAsync: vi.fn(async () => user) } as unknown as never;
    const guard = new JwtAuthGuard(
      jwt,
      auth,
      new Reflector(),
    );
    const request: AuthenticatedRequest = {
      headers: { authorization: 'Bearer test-access-token' },
    };

    await guard.canActivate(contextFor(FakeController.prototype.protectedRoute, request));

    expect(request.user).toEqual(user);
    expect(request.auth).toEqual({ sub: user.id, jti: 'jti-1' });
    expect(request.user?.displayName).toBe('Owner');
  });

  it('APP_GUARD зарегистрированы в порядке JWT → GraphEdit', () => {
    const providers = Reflect.getMetadata('providers', AuthModule) as unknown as Array<{
      provide?: unknown;
      useClass?: { name: string };
    }>;
    const guards = providers
      .filter((provider) => provider !== undefined && provider.provide === APP_GUARD)
      .map((provider) => provider.useClass?.name);

    expect(guards).toEqual(['JwtAuthGuard', 'GraphEditGuard']);
  });

  it('логи не содержат JWT и присваиваний секретов', () => {
    const token = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIn0', 'signature-value'].join('.');
    const message = `failed for ${token} with JWT_SECRET=abcdefghijklmnopqrstuvwxyz123456`;
    const sanitized = sanitizeLogValue(message);

    expect(sanitized).not.toContain(token);
    expect(sanitized).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
    expect(sanitized).toContain('[JWT_REDACTED]');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('AllExceptionsFilter не логирует произвольный объект исключения', () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter();
    const response = { status: () => response, json: () => response };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as Parameters<AllExceptionsFilter['catch']>[1];

    filter.catch(new Error('boom'), host);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0]?.[0] as { event?: string };
    expect(logged.event).toBe('unhandled_exception');
    errorSpy.mockRestore();
  });

  it('ConfigService без JWT_SECRET не создаёт валидный JwtService', () => {
    const config = {
      get: (key: string) => (key === 'JWT_KID' ? 'v1' : undefined),
    } as unknown as ConfigService<Env, true>;
    expect(() => new JwtService(config)).toThrow(/JWT_SECRET/);
  });
});
