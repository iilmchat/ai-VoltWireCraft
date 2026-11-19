// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Модуль проектов: связывает контроллер, сервис, БД и хранилище подложек. */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { drizzleProvider } from '../database/drizzle.provider.js';
import { floorPlanStorageProvider } from './storage/floor-plan-storage.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

/** Модуль хранения проектов и подложек. */
@Module({
  imports: [ConfigModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, drizzleProvider, floorPlanStorageProvider],
  exports: [ProjectsService],
})
export class ProjectsModule {}
