// © 2026 VoltWireCraft — Security Architect / TEC-05 + TEC-06
/** Тесты service-to-service и HITL криптографии (без запуска MCP). */

import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/config/env.schema.js';
import { InternalTokenService } from '../../src/security/internal-token.service.js';
import { HitlService } from '../../src/security/hitl.service.js';
import { InMemoryReplayStore } from '../../src/security/replay-store.js';

const INTERNAL_KEY = 'B1a2C3d4E5f6g7H8i9J0k1L2m3N4o5P6';
const HITL_KEY = 'C1a2C3d4E5f6g7H8i9J0k1L2m3N4o5P6Q7';

function config(overrides: Record<string, unknown> = {}): ConfigService<Env, true> {
  const values: Record<string, string> = {
    INTERNAL_SERVICE_TOKEN: INTERNAL_KEY,
    HITL_SIGNING_KEY: HITL_KEY,
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService<Env, true>;
}

describe('TEC-06 — внутренний service token', () => {
  it('подписанный токен принимается только для своего audience', () => {
    const service = new InternalTokenService(config());
    const token = service.sign('erp-gateway', 'moysklad-mcp');

    expect(service.verify(token, 'moysklad-mcp').sub).toBe('erp-gateway');
    expect(() => service.verify(token, 'bitrix24-mcp')).toThrow(UnauthorizedException);
  });

  it('подмена подписи и истёкший TTL → 401', () => {
    const service = new InternalTokenService(config());
    const token = service.sign('erp-gateway', 'moysklad-mcp');
    const [body] = token.split('.');
    const forged = `${body}.${createHmac('sha256', 'another-key').update(body!).digest('base64url')}`;

    expect(() => service.verify(forged, 'moysklad-mcp')).toThrow(UnauthorizedException);
    expect(() => service.verify('abc', 'moysklad-mcp')).toThrow(UnauthorizedException);
  });

  it('отсутствие ключа — fail-fast', () => {
    expect(() => new InternalTokenService(config({ INTERNAL_SERVICE_TOKEN: undefined }))).toThrow(
      /INTERNAL_SERVICE_TOKEN/,
    );
  });
});

describe('TEC-05 — HITL-токен', () => {
  const expected = {
    sub: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    action: 'create_order' as const,
    itemsHash: 'c'.repeat(64),
  };

  it('привязан к sub/projectId/action/itemsHash и одноразов', async () => {
    const store = new InMemoryReplayStore();
    const service = new HitlService(config(), store);
    const token = service.issue({
      ...expected,
      confirmedBy: '33333333-3333-4333-8333-333333333333',
    });

    const verified = await service.verifyAsync(token, expected);
    expect(verified.sub).toBe(expected.sub);
    expect(verified.projectId).toBe(expected.projectId);

    await expect(service.verifyAsync(token, expected)).rejects.toThrow(/уже использован/);
  });

  it('чужой проект или изменённые позиции → 401 без списания nonce', async () => {
    const service = new HitlService(config(), new InMemoryReplayStore());
    const token = service.issue({
      ...expected,
      confirmedBy: '33333333-3333-4333-8333-333333333333',
    });

    await expect(
      service.verifyAsync(token, { ...expected, projectId: '44444444-4444-4444-8444-444444444444' }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      service.verifyAsync(token, { ...expected, itemsHash: 'd'.repeat(64) }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(service.verifyAsync(token, expected)).resolves.toBeDefined();
  });

  it('подмена подписи → 401', async () => {
    const service = new HitlService(config(), new InMemoryReplayStore());
    const token = service.issue({
      ...expected,
      confirmedBy: '33333333-3333-4333-8333-333333333333',
    });
    const [body] = token.split('.');
    const forged = `${body}.${createHmac('sha256', 'other-key').update(body!).digest('base64url')}`;

    await expect(service.verifyAsync(forged, expected)).rejects.toThrow(UnauthorizedException);
  });
});
