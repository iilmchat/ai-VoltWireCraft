import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import type { Env } from './config/env.schema.js';

/** Точка входа API. */
async function bootstrapAsync(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // F-03: X-Forwarded-For не доверяется по умолчанию — иначе клиент мог бы
  // обойти rate limit подменой заголовка. За доверенным прокси — отдельное PO-решение.
  const httpInstance = app.getHttpAdapter().getInstance() as {
    set?: (name: string, value: unknown) => void;
  };
  httpInstance.set?.('trust proxy', false);

  // Входные данные проверяются ZodValidationPipe на каждом маршруте (RULES § 1.12).
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrapAsync();
