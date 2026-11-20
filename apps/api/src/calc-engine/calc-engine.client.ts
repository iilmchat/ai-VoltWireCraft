// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** HTTP-клиент детерминированного расчётного ядра (RULES § 4.14–4.15, 5.1). */

import { BadGatewayException, GatewayTimeoutException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZodError } from 'zod';
import {
  AutoPanelRequestSchema,
  AutoPanelResponseSchema,
  CalculateCableLengthRequestSchema,
  CalculateCableLengthResponseSchema,
  CadParseResponseSchema,
  LineSizingRequestSchema,
  LineSizingResponseSchema,
  SelectivityTccRequestSchema,
  SelectivityTccResponseSchema,
  ShortCircuitRequestSchema,
  ShortCircuitResponseSchema,
} from '@voltwirecraft/shared/graph.schema.js';
import type {
  AutoPanelRequest,
  AutoPanelResponse,
  CalculateCableLengthRequest,
  CalculateCableLengthResponse,
  CadParseResponse,
  LineSizingRequest,
  LineSizingResponse,
  SelectivityTccRequest,
  SelectivityTccResponse,
  ShortCircuitRequest,
  ShortCircuitResponse,
} from '@voltwirecraft/shared/graph.schema.js';
import type { Env } from '../config/env.schema.js';

/** Таймаут одного расчёта, мс. */
const REQUEST_TIMEOUT_MS = 5000;
/** Путь расчёта длины трассы. */
const CALCULATION_PATH = '/v1/calc/cable-length';
/** Путь расчёта потребительской линии. */
const LINE_SIZING_PATH = '/v1/calc/line-sizing';
/** Путь автосборки щита НКУ. */
const AUTO_PANEL_PATH = '/v1/calc/auto-panel';
/** Путь расчёта однофазного КЗ. */
const SHORT_CIRCUIT_PATH = '/v1/calc/short-circuit';
/** Путь разбора CAD-плана. */
const CAD_PARSE_PATH = '/v1/cad/parse-dxf';
/** Путь расчёта селективности по время-токовым характеристикам. */
const SELECTIVITY_TCC_PATH = '/v1/calc/selectivity-tcc';

/** Параметры одного вызова расчётного ядра. */
interface CalculationCall<TPayload, TResult> {
  /** Путь эндпоинта. */
  readonly path: string;
  /** Тело запроса. */
  readonly payload: TPayload;
  /** Схема ответа для валидации на границе. */
  readonly responseSchema: {
    parse: (value: unknown) => TResult;
  };
}

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
    return this.postAsync({
      path: CALCULATION_PATH,
      payload: CalculateCableLengthRequestSchema.parse(request),
      responseSchema: CalculateCableLengthResponseSchema,
    });
  }

  /**
   * Рассчитывает ток, сечение, потерю напряжения и аппараты защиты линии.
   *
   * @param request — мощность, напряжение, cosφ, длина и способ прокладки.
   * @returns провалидированный ответ ядра.
   * @throws {BadGatewayException} если ядро недоступно или вернуло некорректный ответ.
   */
  public async calculateLineSizingAsync(request: LineSizingRequest): Promise<LineSizingResponse> {
    return this.postAsync({
      path: LINE_SIZING_PATH,
      payload: LineSizingRequestSchema.parse(request),
      responseSchema: LineSizingResponseSchema,
    });
  }

  /**
   * Вызывает детерминированную автосборку щита НКУ в расчётном ядре.
   *
   * @param request — узлы, помещения и параметры ввода.
   * @returns провалидированный проект щита.
   * @throws {BadGatewayException} если ядро недоступно или вернуло некорректный ответ.
   */
  public async autoAssemblePanelAsync(request: AutoPanelRequest): Promise<AutoPanelResponse> {
    return this.postAsync({
      path: AUTO_PANEL_PATH,
      payload: AutoPanelRequestSchema.parse(request),
      responseSchema: AutoPanelResponseSchema,
    });
  }

  /**
   * Рассчитывает минимальный ток однофазного КЗ и селективность в ядре.
   *
   * @param request — параметры петли «фаза-ноль» и автоматов.
   * @returns провалидированный ответ ядра.
   * @throws {BadGatewayException|GatewayTimeoutException} при ошибке вызова.
   */
  public async checkShortCircuitAsync(
    request: ShortCircuitRequest,
  ): Promise<ShortCircuitResponse> {
    return this.postAsync({
      path: SHORT_CIRCUIT_PATH,
      payload: ShortCircuitRequestSchema.parse(request),
      responseSchema: ShortCircuitResponseSchema,
    });
  }

  /**
   * Проверяет селективность цепочки аппаратов по время-токовым характеристикам.
   *
   * @param request — аппараты цепочки и потери напряжения.
   * @returns провалидированный протокол ВТХ от расчётного ядра.
   * @throws {BadGatewayException|GatewayTimeoutException} при ошибке вызова.
   */
  public async checkSelectivityTccAsync(
    request: SelectivityTccRequest,
  ): Promise<SelectivityTccResponse> {
    return this.postAsync({
      path: SELECTIVITY_TCC_PATH,
      payload: SelectivityTccRequestSchema.parse(request),
      responseSchema: SelectivityTccResponseSchema,
    });
  }

  /**
   * Отправляет DXF-файл в изолированный парсер ядра.
   *
   * @param file — содержимое файла и имя.
   * @returns стены в метрах СИ.
   * @throws {BadGatewayException|GatewayTimeoutException} при ошибке вызова.
   */
  public async parseDxfAsync(file: {
    readonly bytes: Buffer;
    readonly fileName: string;
  }): Promise<CadParseResponse> {
    const url = new URL(CAD_PARSE_PATH, this.config.get('CALC_ENGINE_URL', { infer: true }));
    const controller = new AbortController();
    const timeout: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), 30_000);
    const body = new FormData();
    body.append(
      'file',
      new Blob([new Uint8Array(file.bytes)], { type: 'application/dxf' }),
      file.fileName,
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new BadGatewayException(`Calc-engine вернул HTTP ${response.status} при разборе CAD`);
      }
      return CadParseResponseSchema.parse(await response.json());
    } catch (error: unknown) {
      if (error instanceof BadGatewayException || error instanceof GatewayTimeoutException) {
        throw error;
      }
      if (error instanceof ZodError) {
        throw new BadGatewayException({
          message: 'Calc-engine вернул некорректный ответ разбора CAD',
          details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException('Превышен таймаут разбора CAD');
      }
      const detail = error instanceof Error ? error.message : 'неизвестная ошибка';
      throw new BadGatewayException(`Не удалось разобрать CAD: ${detail}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Выполняет POST-запрос к ядру и проверяет ответ по Zod-схеме.
   *
   * @param call — путь, тело и схема ответа.
   * @returns провалидированный результат расчёта.
   * @throws {BadGatewayException|GatewayTimeoutException} при ошибке вызова.
   */
  private async postAsync<TPayload, TResult>(call: CalculationCall<TPayload, TResult>): Promise<TResult> {
    const url = new URL(call.path, this.config.get('CALC_ENGINE_URL', { infer: true }));
    const controller = new AbortController();
    const timeout: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(call.payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadGatewayException(`Расчётное ядро вернуло HTTP ${response.status}`);
      }

      const body: unknown = await response.json();
      return call.responseSchema.parse(body);
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
