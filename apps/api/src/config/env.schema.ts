import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * Схема переменных окружения API. Валидация выполняется при старте,
 * ошибка конфигурации останавливает процесс (fail-fast, RULES § 4.5).
 *
 * v0.9.1 / SEC-01: у JWT_secret нет значения по умолчанию ни в одном
 * окружении. Требование production зафиксировано PO; распространение
 * обязательности на dev/test — техническая политика Security Architect
 * (D-14, PROPOSED), исключающая обход прод-валидации через dev-конфигурацию.
 */

/** Публичные/статические значения, которые нельзя использовать как секреты. */
export const FORBIDDEN_SECRET_VALUES = [
  'voltwirecraft-local-dev-secret-change-me-please',
  'replace-with-random-32-character-secret-value',
  'replace-with-local-dev-password',
  'changeme',
  'change-me',
  'secret',
  'password',
  'test',
] as const;

/** Разбирает TTL вида `15m`, `30d` в секунды. */
export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (match === null) {
    return Number.NaN;
  }
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };
  return Number(match[1]) * multipliers[match[2]!]!;
}

/** Проверка, что значение не является известной заглушкой. */
function isForbiddenSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    FORBIDDEN_SECRET_VALUES.some(
      (forbidden) => normalized === forbidden || normalized.includes(forbidden),
    ) || /^(?:replace[-_]?with|dummy|placeholder|sample)/i.test(normalized)
  );
}

/** Валидатор обязательного секрета: без значения по умолчанию. */
const requiredSecret = z
  .string()
  .min(32, 'Секрет должен содержать не менее 32 символов')
  .refine((value) => !isForbiddenSecret(value), 'Запрещено публичное, default или dummy значение секрета');

/** TTL с явным верхним пределом. */
const ttlSchema = z
  .string()
  .regex(/^\d+[smhd]$/, 'Например: 15m, 12h, 30d')
  .refine((value) => parseDurationSeconds(value) > 0, 'TTL должен быть положительным');

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
  /**
   * SEC-01: секрет подписи JWT. Обязателен всегда, статического значения нет.
   * В production допускается доставка через `JWT_SECRET_FILE` (Docker secret).
   */
  JWT_SECRET: requiredSecret.optional(),
  JWT_SECRET_FILE: z.string().min(1).optional(),
  /** Идентификатор ключа в header JWT. Не является секретом. */
  JWT_KID: z.string().min(1).default('v1'),
  /** Access TTL: 15 минут по умолчанию (SEC-02-B). */
  JWT_EXPIRES_IN: ttlSchema.default('15m'),
  /** Refresh TTL: 30 дней по умолчанию (SEC-02-B). */
  JWT_REFRESH_EXPIRES_IN: ttlSchema.default('30d'),
  /** TEC-07: отдельный pepper для хеширования refresh-токенов. */
  JWT_REFRESH_HASH_PEPPER: requiredSecret.optional(),
  /** TEC-02: разрешённые Origin для cookie-транспорта refresh (через запятую). */
  AUTH_ALLOWED_ORIGINS: z.string().optional(),
  /** TEC-05: ключ подписи HITL-токенов. */
  HITL_SIGNING_KEY: requiredSecret.optional(),
  /** TEC-06: токен для service-to-service вызовов. */
  INTERNAL_SERVICE_TOKEN: requiredSecret.optional(),
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
  const requireSecret = (name: 'JWT_SECRET' | 'JWT_SECRET_FILE'): void => {
    const value = env[name];
    if (value === undefined) {
      context.addIssue({
        code: 'custom',
        path: [name],
        message: `${name} обязателен (статические/default/dummy значения запрещены)`,
      });
    }
  };

  requireSecret('JWT_SECRET');

  if (env.JWT_SECRET !== undefined && env.JWT_SECRET_FILE !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['JWT_SECRET_FILE'],
      message: 'Нельзя задавать JWT_SECRET и JWT_SECRET_FILE одновременно',
    });
  }

  const accessSeconds = parseDurationSeconds(env.JWT_EXPIRES_IN);
  const refreshSeconds = parseDurationSeconds(env.JWT_REFRESH_EXPIRES_IN);

  if (!Number.isFinite(accessSeconds) || accessSeconds <= 0 || accessSeconds > 3600) {
    context.addIssue({
      code: 'custom',
      path: ['JWT_EXPIRES_IN'],
      message: 'Access TTL должен быть от 1 секунды до 1 часа',
    });
  }
  if (!Number.isFinite(refreshSeconds) || refreshSeconds <= accessSeconds) {
    context.addIssue({
      code: 'custom',
      path: ['JWT_REFRESH_EXPIRES_IN'],
      message: 'Refresh TTL должен быть больше Access TTL',
    });
  }

  if (env.JWT_REFRESH_HASH_PEPPER !== undefined && env.JWT_REFRESH_HASH_PEPPER === env.JWT_SECRET) {
    context.addIssue({
      code: 'custom',
      path: ['JWT_REFRESH_HASH_PEPPER'],
      message: 'TEC-07: pepper не должен совпадать с JWT_SECRET',
    });
  }

  if (env.NODE_ENV === 'production') {
    if (accessSeconds !== 900) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_EXPIRES_IN'],
        message: 'В production Access TTL должен быть ровно 15 минут',
      });
    }
    if (refreshSeconds !== 2_592_000) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_EXPIRES_IN'],
        message: 'В production Refresh TTL должен быть ровно 30 дней',
      });
    }
    for (const name of ['JWT_REFRESH_HASH_PEPPER', 'HITL_SIGNING_KEY', 'INTERNAL_SERVICE_TOKEN'] as const) {
      if (env[name] === undefined) {
        context.addIssue({
          code: 'custom',
          path: [name],
          message: `${name} обязателен в production`,
        });
      }
    }
  }

  if (env.STORAGE_DRIVER !== 's3') {
    return;
  }
  for (const key of ['S3_BUCKET', 'S3_REGION'] as const) {
    if (env[key] === undefined) {
      context.addIssue({
        code: 'custom',
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
 * ВАЖНО: в сообщение об ошибке попадают только путь и описание issue.
 * Значения секретов никогда не включаются в текст — это предотвращает
 * утечку через логи и ответы API.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  // SEC-01: поддержка Docker/Kubernetes secrets через `*_FILE`.
  // Файл читается до валидации; содержимое никогда не попадает в текст ошибки.
  let resolved: Record<string, unknown> = { ...config };
  if (typeof resolved['JWT_SECRET_FILE'] === 'string') {
    // Взаимоисключение проверяется на СЫРЫХ переменных, до подстановки
    // значения из файла. Иначе подстановка создавала бы JWT_SECRET и
    // новую проверка всегда отвергала file-путь (дефект v0.9.1).
    if (resolved['JWT_SECRET'] !== undefined) {
      throw new Error(
        'Некорректная конфигурация окружения: нельзя задавать JWT_SECRET и JWT_SECRET_FILE одновременно',
      );
    }
    try {
      const fromFile = readFileSync(resolved['JWT_SECRET_FILE'], 'utf8').trim();
      resolved = { ...resolved, JWT_SECRET: fromFile };
      delete resolved['JWT_SECRET_FILE'];
    } catch {
      throw new Error('Некорректная конфигурация окружения: не удалось прочитать JWT_SECRET_FILE');
    }
  }

  const result = EnvSchema.safeParse(resolved);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<корень>'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Некорректная конфигурация окружения: ${details}`);
  }
  return result.data;
}
