// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Регрессионный тест сборки итогового AppModule и защищённого HTTP-маршрута. */

import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Тест поднимает настоящее приложение без подмены провайдеров: именно так
 * ловится DI-дефект `JwtAuthGuard -> JwtService` в `ProjectsModule`, который
 * не видели модульные тесты с моками.
 */
describe('AppModule bootstrap (v0.9.1)', () => {
  let app: INestApplication | undefined;
  let baseUrl = '';

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://vwc:vwc@localhost:5432/voltwirecraft';
    process.env.REDIS_URL ??= 'redis://localhost:6379/0';
    process.env.CALC_ENGINE_URL ??= 'http://localhost:8000';
    process.env.JWT_SECRET ??= 'Z'.repeat(48);
    process.env.HITL_SIGNING_KEY ??= 'Y'.repeat(48);

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const server = app.getHttpServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
  });

  it('собирает итоговый AppModule без подмены провайдеров', () => {
    expect(app).toBeDefined();
  });

  it('GET /projects без токена → 401', async () => {
    const response = await fetch(`${baseUrl}/projects`);
    expect(response.status).toBe(401);
  });

  it('PUT /projects/:id/graph без токена → 401 (старая защита записи сохранена)', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const response = await fetch(`${baseUrl}/projects/${id}/graph`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ graph: {} }),
    });
    expect(response.status).toBe(401);
  });
});
