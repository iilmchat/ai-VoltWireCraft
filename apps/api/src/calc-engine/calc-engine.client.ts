// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** HTTP-клиент детерминированного расчётного ядра (RULES § 4.14–4.15, 5.1). */

import { BadGatewayException, GatewayTimeoutException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZodError } from 'zod';
import {
  CalculateCableLengthRequestSchema,
  CalculateCableLengthResponseSchema,
} from '@voltwirecraft/shared/graph.schema.js';
import type {
  CalculateCableLengthRequest,
  CalculateCableLengthResponse,
} from '@voltwirecraft/shared/graph.schema.js';
import type { Env } from '../config/env.schema.js';

/** Таймаут одного расчёта, мс. */
const REQUEST_TIMEOUT_MS = 5000;
/** Актуальный путь эндпоинта расчётного ядра. */
const CALCULATION_PATH = '/v1/calc/cable-length';

/**
 * Клиент calc-engine: все ответы проверяются Zod на границе,
 * при таймауте запрос прерывается через `AbortController`.
 */
@Injectable()
export class CalcEngineClient {
  /**
   * @param config — валидированная конфигурация приложения.
   */
  public constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  /**
   * Рассчитывает длину кабельной трассы в расчётном ядре.
   *
   * @param request — запрос с координатами, масштабом и высотами.
   * @returns провалидированный ответ ядра.
   * @throws {BadGatewayException} если ядро недоступно или вернуло некорректный ответ.
   * @throws {GatewayTimeoutException} если время ожидания истекло.
   */
  public async calculateCableLengthAsync(
    request: CalculateCableLengthRequest,
  ): Promise<CalculateCableLengthResponse> {
    const payload = CalculateCableLengthRequestSchema.parse(request);
    const url = new URL(CALCULATION_PATH, this.config.get('CALC_ENGINE_URL', { infer: true }));
    const controller = new AbortController();
    const timeout: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadGatewayException(`Расчётное ядро вернуло HTTP ${response.status}`);
      }

      const body: unknown = await response.json();
      return CalculateCableLengthResponseSchema.parse(body);
    } catch (error: unknown) {
      if (error instanceof BadGatewayException || error instanceof GatewayTimeoutException) {
        throw error;
      }
      if (error instanceof ZodError) {
        throw new BadGatewayException({
          message: 'Расчётное ядро вернуло ответ, не соответствующий контракту',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException('Превышено время ожидания расчётного ядра');
      }
      const detail = error instanceof Error ? error.message : 'неизвестная ошибка';
      throw new BadGatewayException(`Не удалось вызвать расчётное ядро: ${detail}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
