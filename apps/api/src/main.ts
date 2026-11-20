import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import type { Env } from './config/env.schema.js';

/** Точка входа API. */
async function bootstrapAsync(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Входные данные проверяются ZodValidationPipe на каждом маршруте (RULES § 1.12).
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrapAsync();
