import { describe, expect, it } from 'vitest';
import { validateEnv } from '../src/config/env.schema.js';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:password@localhost:5436/voltwirecraft',
  REDIS_URL: 'redis://localhost:6381/0',
  CALC_ENGINE_URL: 'http://localhost:8000',
};

describe('validateEnv', () => {
  it('подставляет значения по умолчанию и возвращает типизированную конфигурацию', () => {
    const env = validateEnv(baseEnv);

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.LLM_BASE_URL).toBe('https://api.openai.com');
    expect(env.LLM_MODEL).toBe('gpt-4o-mini');
    expect(env.EMBEDDING_MODEL).toBe('text-embedding-3-small');
    expect(env.LLM_API_KEY).toBeUndefined();
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

  it('прерывает запуск при отсутствии обязательной переменной', () => {
    const { CALC_ENGINE_URL: _unused, ...withoutCalc } = baseEnv;
    expect(() => validateEnv(withoutCalc)).toThrow();
  });
});
