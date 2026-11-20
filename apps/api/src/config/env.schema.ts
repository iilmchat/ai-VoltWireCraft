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
  // LLM-роутер: OpenAI-совместимый cloud API или локальный LM Studio / Ollama.
  LLM_BASE_URL: z
    .url()
    .refine((value) => /^https?:\/\//.test(value), 'Ожидается http:// или https://')
    .default('https://api.openai.com'),
  /** Для локальных провайдеров допускается заглушка; реальный ключ — только в `.env`. */
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).default('gpt-4o-mini'),
  EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),
  // MCP-интеграции (опциональный profile `integrations` в docker-compose).
  BITRIX24_MCP_URL: z
    .url()
    .refine((value) => /^https?:\/\//.test(value), 'Ожидается http:// или https://')
    .default('http://localhost:5003'),
  MOYSKLAD_MCP_URL: z
    .url()
    .refine((value) => /^https?:\/\//.test(value), 'Ожидается http:// или https://')
    .default('http://localhost:5004'),
  BITRIX24_WEBHOOK_URL: z.url().optional(),
  MOYSKLAD_TOKEN: z.string().min(1).optional(),
  /** Таймаут HTTP-вызова MCP-сервера, мс. */
  MCP_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // Хранилище подложек: локальная файловая система или S3-совместимое хранилище.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().min(1).default('./storage/floor-plans'),
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ENDPOINT: z.url().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
}).superRefine((env, context) => {
  if (env.STORAGE_DRIVER !== 's3') {
    return;
  }
  for (const key of ['S3_BUCKET', 'S3_REGION'] as const) {
    if (env[key] === undefined) {
      context.addIssue({
        code: 'custom',
        input: env[key],
        path: [key],
        message: `При STORAGE_DRIVER=s3 необходимо задать ${key}`,
      });
    }
  }
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
