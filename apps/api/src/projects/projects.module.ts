// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Модуль проектов: связывает контроллер, сервис, БД и хранилище подложек. */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentsModule } from '../agents/agents.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CalcEngineModule } from '../calc-engine/calc-engine.module.js';
import { drizzleProvider } from '../database/drizzle.provider.js';
import { floorPlanStorageProvider } from './storage/floor-plan-storage.js';
import { CalcProxyController } from './calc-proxy.controller.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

/**
 * Модуль хранения проектов и подложек.
 *
 * `AuthModule` импортирован явно: контроллеры модуля используют классовые
 * `JwtAuthGuard`/`GraphEditGuard`, а Nest разрешает зависимости таких guards
 * строго в модуле контроллера. Без импорта `AppModule` не собирается
 * (`JwtService` и `ProjectAccessService` для `ProjectsModule` недоступны).
 * Импорт не создаёт цикла: `AuthModule` не импортирует проектные модули.
 */
@Module({
  imports: [ConfigModule, AuthModule, CalcEngineModule, AgentsModule],
  controllers: [ProjectsController, CalcProxyController],
  providers: [ProjectsService, drizzleProvider, floorPlanStorageProvider],
  exports: [ProjectsService],
})
export class ProjectsModule {}
