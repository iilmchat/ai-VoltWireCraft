import { z } from 'zod';

/**
 * Схема переменных окружения API. Валидация выполняется при старте,
 * ошибка конфигурации останавливает процесс (fail-fast, RULES § 4.5).
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z
    .url()
    .refine((value) => /^postgres(?:ql)?:\/\//.test(value), 'Ожидается postgres:// или postgresql://'),
  REDIS_URL: z.url().refine((value) => /^rediss?:\/\//.test(value), 'Ожидается redis:// или rediss://'),
  CALC_ENGINE_URL: z
    .url()
    .refine((value) => /^https?:\/\//.test(value), 'Ожидается http:// или https://'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

/** Тип валидированной конфигурации приложения. */
export type Env = z.infer<typeof EnvSchema>;

/**
 * Функция валидации для `ConfigModule.forRoot`.
 *
 * @param config — сырые переменные окружения.
 * @returns валидированная конфигурация.
 * @throws {Error} если одна или несколько переменных некорректны.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<корень>'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Некорректная конфигурация окружения: ${details}`);
  }
  return result.data;
}
