// © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
/** Шлюз к MCP-серверам МойСклад и Битрикс24 (RULES § 4.14–4.15, 6.1). */

import { randomUUID } from 'node:crypto';
import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  IntegrationStatusSchema,
  type IntegrationStatus,
} from '@voltwirecraft/shared/graph.schema.js';
import type { Env } from '../config/env.schema.js';

/** Идентификатор MCP-сервера. */
export type McpServer = 'moysklad' | 'bitrix24';

/** Результат вызова инструмента с Zod-проверкой ответа. */
export interface McpCall<TResult> {
  /** Валидированный результат. */
  readonly data: TResult;
  /** Идентификатор операции в журнале. */
  readonly operationId: string;
}

/**
 * Вызывает MCP-серверы по HTTP. Токены и секреты не логируются;
 * операции записи требуют `confirmationToken` (HITL).
 */
@Injectable()
export class ErpMcpService {
  /**
   * @param config — валидированная конфигурация.
   */
  public constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  /**
   * Проверяет доступность обоих MCP-серверов.
   *
   * @returns статусы подключений.
   */
  public async statusAsync(): Promise<IntegrationStatus[]> {
    const servers: readonly McpServer[] = ['moysklad', 'bitrix24'];
    return Promise.all(
      servers.map(async (server) => {
        try {
          const response = await fetch(new URL('/health', this.baseUrl(server)), {
            method: 'GET',
            signal: this.abortSignal(),
          });
          return IntegrationStatusSchema.parse({
            server,
            available: response.ok,
            message: response.ok ? 'MCP-сервер доступен' : `HTTP ${response.status}`,
            tools:
              server === 'moysklad'
                ? ['get_stock', 'create_order']
                : ['find_deal', 'send_estimate'],
          });
        } catch {
          return IntegrationStatusSchema.parse({
            server,
            available: false,
            message: 'MCP-сервер недоступен',
            tools: [],
          });
        }
      }),
    );
  }

  /**
   * Вызывает инструмент MCP-сервера и проверяет ответ по Zod-схеме.
   *
   * @param server — целевой MCP-сервер.
   * @param tool — имя инструмента.
   * @param args — аргументы инструмента.
   * @param responseSchema — схема ответа.
   * @param confirmationToken — токен HITL-подтверждения для операций записи.
   * @returns валидированный результат и идентификатор операции.
   * @throws {BadGatewayException} при ошибке сервера или некорректном ответе.
   */
  public async callToolAsync<TResult>(
    server: McpServer,
    tool: string,
    args: Record<string, unknown>,
    responseSchema: z.ZodType<TResult>,
    confirmationToken?: string,
  ): Promise<McpCall<TResult>> {
    // Реальный FastAPI register: /mcp/tools/{tool_name}; payload — плоский,
    // аргументы передаются в корне, а не под ключом `arguments`.
    const url = new URL(`/mcp/tools/${encodeURIComponent(tool)}`, this.baseUrl(server));
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...args,
          ...(confirmationToken !== undefined ? { confirmationToken } : {}),
        }),
        signal: this.abortSignal(),
      });
      if (!response.ok) {
        throw new BadGatewayException(`MCP ${server}/${tool}: HTTP ${response.status}`);
      }
      const payload: unknown = await response.json();
      const envelope = z
        .object({
          success: z.boolean(),
          tool: z.string().min(1),
          data: z.unknown(),
          message: z.string(),
        })
        .parse(payload);
      if (!envelope.success || envelope.tool !== tool) {
        throw new BadGatewayException(`MCP ${server}/${tool}: ${envelope.message}`);
      }
      return {
        data: responseSchema.parse(envelope.data),
        operationId: `op-${randomUUID()}`,
      };
    } catch (error: unknown) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : 'неизвестная ошибка';
      throw new BadGatewayException(`Не удалось вызвать MCP ${server}/${tool}: ${detail}`);
    }
  }

  /**
   * Возвращает базовый URL MCP-сервера из конфигурации.
   *
   * @param server — идентификатор сервера.
   * @returns базовый URL.
   */
  private baseUrl(server: McpServer): string {
    const key = server === 'moysklad' ? 'MOYSKLAD_MCP_URL' : 'BITRIX24_MCP_URL';
    return this.config.get(key, { infer: true });
  }

  /**
   * Создаёт AbortSignal с таймаутом из конфигурации.
   *
   * @returns сигнал прерывания.
   */
  private abortSignal(): AbortSignal {
    return AbortSignal.timeout(this.config.get('MCP_HTTP_TIMEOUT_MS', { infer: true }));
  }
}
