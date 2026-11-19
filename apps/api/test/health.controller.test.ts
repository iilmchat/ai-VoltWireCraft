import { describe, expect, it } from 'vitest';
import { HealthController } from '../src/health/health.controller.js';
import type { HealthReport } from '../src/health/health.types.js';
import type { HealthService } from '../src/health/health.service.js';

function makeReport(status: HealthReport['status']): HealthReport {
  return {
    status,
    version: '0.1.0',
    uptimeSeconds: 42,
    services: [
      { name: 'postgres', status: 'ok' },
      { name: 'redis', status: status === 'ok' ? 'ok' : 'error', detail: 'нет ответа' },
      { name: 'calcEngine', status: 'ok' },
    ],
  };
}

function makeHealthService(report: HealthReport): HealthService {
  return { checkAsync: async () => report } as unknown as HealthService;
}

describe('HealthController', () => {
  it('возвращает success=true, когда все сервисы доступны', async () => {
    const controller = new HealthController(makeHealthService(makeReport('ok')));

    const response = await controller.getHealthAsync();

    expect(response.success).toBe(true);
    expect(response.data.services).toHaveLength(3);
  });

  it('возвращает success=false при деградации сервисов', async () => {
    const controller = new HealthController(makeHealthService(makeReport('degraded')));

    const response = await controller.getHealthAsync();

    expect(response.success).toBe(false);
    expect(response.message).toMatch(/недоступна/);
  });
});
