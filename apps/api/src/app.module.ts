import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CalcEngineModule } from './calc-engine/calc-engine.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { validateEnv } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { RedisModule } from './redis/redis.module.js';

/** Корневой модуль API. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    AuthModule,
    CalcEngineModule,
    CatalogModule,
    RedisModule,
    HealthModule,
    ProjectsModule,
    IntegrationsModule,
  ],
})
export class AppModule {}
