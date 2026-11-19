// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Адаптер OpenAI-совместимого LLM: только объяснения, никакой математики (RULES § 5.1). */

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Env } from '../config/env.schema.js';

/** Ответ chat/completions: содержимое первого сообщения ассистента. */
const ChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().min(1) }),
    }),
  ).min(1),
});

/** Аргумент генерации пояснения. */
export interface ExplanationRequest {
  /** Системная инструкция (запрет вычислений). */
  readonly system: string;
  /** Пользовательский промпт с фактами из инструментов. */
  readonly prompt: string;
}

/**
 * Вызывает OpenAI-совместимый endpoint через `fetch`.
 * При отсутствии ключа или сетевой ошибке возвращает детерминированный
 * fallback — агент продолжает работать в режиме «только инструменты».
 */
@Injectable()
export class LlmClient {
  /**
   * @param config — валидированная конфигурация приложения.
   */
  public constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  /**
   * Генерирует пояснение на русском языке по фактам, полученным от инструментов.
   *
   * @param request — системная инструкция и промпт с фактами.
   * @returns текст пояснения.
   */
  public async generateExplanationAsync(request: ExplanationRequest): Promise<string> {
    const baseUrl = this.config.get('LLM_BASE_URL', { infer: true }).replace(/\/+$/, '');
    const apiKey = this.config.get('LLM_API_KEY', { infer: true });
    if (apiKey === undefined && baseUrl === 'https://api.openai.com') {
      return this.fallbackAsync(request.prompt);
    }

    const path = baseUrl.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
    const url = new URL(path, `${baseUrl}/`);
    const controller = new AbortController();
    const timeout: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey !== undefined ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.get('LLM_MODEL', { infer: true }),
          temperature: 0,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return this.fallbackAsync(request.prompt);
      }
      const parsed = ChatResponseSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.choices[0]!.message.content : this.fallbackAsync(request.prompt);
    } catch {
      return this.fallbackAsync(request.prompt);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Формирует объяснение без обращения к модели.
   *
   * @param prompt — факты от инструментов.
   * @returns детерминированный текст.
   */
  private async fallbackAsync(prompt: string): Promise<string> {
    return `Решение подготовлено детерминированными инструментами. ${prompt}`;
  }
}
