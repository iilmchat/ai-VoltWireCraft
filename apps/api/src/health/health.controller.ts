import { Controller, Get } from '@nestjs/common';
import type { ApiResponse } from '../common/api-response.js';
import type { HealthReport } from './health.types.js';
// Импорт нужен как значение: emitDecoratorMetadata использует его для DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { HealthService } from './health.service.js';
import { Public } from '../auth/public.decorator.js';

/** Контроллер проверки готовности сервисов. */
@Controller('health')
export class HealthController {
  /**
   * @param healthService — сервис проверки инфраструктуры.
   */
  public constructor(private readonly healthService: HealthService) {}

  /**
   * Возвращает состояние PostgreSQL, Redis и расчётного ядра.
   *
   * @returns ответ в едином формате `ApiResponse`.
   */
  @Get()
  @Public()
  public async getHealthAsync(): Promise<ApiResponse<HealthReport>> {
    const report = await this.healthService.checkAsync();
    return {
      success: report.status === 'ok',
      data: report,
      message: report.status === 'ok' ? 'Все сервисы доступны' : 'Часть сервисов недоступна',
    };
  }
}
