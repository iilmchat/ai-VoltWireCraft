import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateEnv } from '../src/config/env.schema.js';

/** Секрет без подстрок из denylist заглушек. */
const SECRET = ['A1b2C3d4', 'E5f6g7H8', 'i9J0k1L2', 'm3N4o5P6'].join('');
const OTHER_SECRET = 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:password@localhost:5436/voltwirecraft',
  REDIS_URL: 'redis://localhost:6381/0',
  CALC_ENGINE_URL: 'http://localhost:8000',
  JWT_SECRET: SECRET,
};

const prodEnv = {
  ...baseEnv,
  NODE_ENV: 'production' as const,
  JWT_REFRESH_HASH_PEPPER: OTHER_SECRET,
  HITL_SIGNING_KEY: 'Q1w2E3r4T5y6U7i8O9p0A1s2D3f4G5h6',
  INTERNAL_SERVICE_TOKEN: 'L1k2J3h4G5f6D7s8A9p0O1i2U3y4T5r6',
  AUTH_ALLOWED_ORIGINS: 'https://app.example.com',
};

describe('validateEnv — SEC-01', () => {
  it('подставляет безопасные значения по умолчанию', () => {
    const env = validateEnv(baseEnv);

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_SECRET).toBe(SECRET);
    expect(env.JWT_KID).toBe('v1');
    expect(env.JWT_EXPIRES_IN).toBe('15m');
    expect(env.JWT_REFRESH_EXPIRES_IN).toBe('30d');
    expect(env.LLM_MODEL).toBe('gpt-4o-mini');
  });

  it('не имеет статического JWT_SECRET по умолчанию', () => {
    const { JWT_SECRET: _secret, ...withoutSecret } = baseEnv;
    expect(() => validateEnv(withoutSecret)).toThrow(/JWT_SECRET/);
  });

  it('отвергает публичный default и dummy secret', () => {
    for (const value of [
      'voltwirecraft-local-dev-secret-change-me-please',
      'replace-with-random-32-character-secret-value',
      'changeme12345678901234567890123456',
    ]) {
      expect(() => validateEnv({ ...baseEnv, JWT_SECRET: value })).toThrow(/JWT_SECRET/);
    }
  });

  it('JWT_SECRET_FILE читается, если прямой JWT_SECRET не задан', () => {
    const { JWT_SECRET: _secret, ...withoutSecret } = baseEnv;
    const path = join(tmpdir(), `vwc-jwt-${process.pid}.txt`);
    writeFileSync(path, `${SECRET}\n`, 'utf8');

    const env = validateEnv({ ...withoutSecret, JWT_SECRET_FILE: path });
    expect(env.JWT_SECRET).toBe(SECRET);
  });

  it('JWT_SECRET и JWT_SECRET_FILE одновременно — fail-fast', () => {
    const path = join(tmpdir(), `vwc-jwt-${process.pid}.txt`);
    writeFileSync(path, SECRET, 'utf8');
    expect(() => validateEnv({ ...baseEnv, JWT_SECRET_FILE: path })).toThrow(
      /одновременно/,
    );
  });

  it('нечитаемый JWT_SECRET_FILE — fail-fast без утечки значения', () => {
    expect(() =>
      validateEnv({ ...baseEnv, JWT_SECRET_FILE: join(tmpdir(), 'vwc-missing-secret.txt') }),
    ).toThrow(/JWT_SECRET_FILE/);
  });

  it('production требует secret, pepper, HITL key и internal token', () => {
    expect(() => validateEnv({ ...baseEnv, NODE_ENV: 'production' })).toThrow(
      /JWT_REFRESH_HASH_PEPPER/,
    );
    expect(() => validateEnv(prodEnv)).not.toThrow();
  });

  it('F-04: production требует явный AUTH_ALLOWED_ORIGINS без wildcard', () => {
    const { AUTH_ALLOWED_ORIGINS: _origins, ...withoutOrigins } = prodEnv;
    expect(() => validateEnv(withoutOrigins)).toThrow(/AUTH_ALLOWED_ORIGINS/);
    expect(() => validateEnv({ ...prodEnv, AUTH_ALLOWED_ORIGINS: '*' })).toThrow(
      /AUTH_ALLOWED_ORIGINS/,
    );
    expect(() =>
      validateEnv({ ...prodEnv, AUTH_ALLOWED_ORIGINS: 'https://a.example.com,https://b.example.com' }),
    ).not.toThrow();
  });

  it('production требует ровно 15m/30d', () => {
    expect(() =>
      validateEnv({ ...prodEnv, JWT_EXPIRES_IN: '7d' }),
    ).toThrow(/JWT_EXPIRES_IN/);
    expect(() =>
      validateEnv({ ...prodEnv, JWT_REFRESH_EXPIRES_IN: '7d' }),
    ).toThrow(/JWT_REFRESH_EXPIRES_IN/);
  });

  it('TEC-07: pepper не должен совпадать с JWT_SECRET', () => {
    expect(() =>
      validateEnv({ ...prodEnv, JWT_REFRESH_HASH_PEPPER: SECRET }),
    ).toThrow(/JWT_REFRESH_HASH_PEPPER/);
  });

  it('не раскрывает значение секрета в тексте ошибки', () => {
    try {
      validateEnv({ ...prodEnv, JWT_SECRET: 'short' });
      throw new Error('ожидался отказ валидации');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('JWT_SECRET');
      expect(message).not.toContain('short');
    }
  });

  it('отвергает слишком большой TTL access', () => {
    expect(() => validateEnv({ ...baseEnv, JWT_EXPIRES_IN: '999d' })).toThrow(
      /JWT_EXPIRES_IN/,
    );
  });

  it('принимает локальный OpenAI-совместимый провайдер', () => {
    const env = validateEnv({
      ...baseEnv,
      LLM_BASE_URL: 'http://127.0.0.1:1234/v1',
      LLM_API_KEY: 'local-placeholder',
      LLM_MODEL: 'qwen2.5-coder',
    });
    expect(env.LLM_BASE_URL).toBe('http://127.0.0.1:1234/v1');
    expect(env.LLM_MODEL).toBe('qwen2.5-coder');
  });

  it('прерывает запуск при некорректной строке подключения', () => {
    expect(() => validateEnv({ ...baseEnv, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /конфигурация окружения/i,
    );
  });
});
