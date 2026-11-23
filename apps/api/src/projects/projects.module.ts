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
 * Защита реализована глобальными `APP_GUARD` из `AuthModule` (этап 0),
 * class-level `@UseGuards` удалены. Явный импорт `AuthModule` сохранён
 * после DI-фикса Backend Architect: он делает зависимости auth-провайдеров
 * доступными в этом module scope и не создаёт цикла (`AuthModule` не
 * импортирует проектные модули). Meta-тест проверяет отсутствие
 * локальных class-level guard декораторов в исходниках.
 */
@Module({
  imports: [ConfigModule, AuthModule, CalcEngineModule, AgentsModule],
  controllers: [ProjectsController, CalcProxyController],
  providers: [ProjectsService, drizzleProvider, floorPlanStorageProvider],
  exports: [ProjectsService],
})
export class ProjectsModule {}
