// © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
/** Модуль публичного каталога оборудования. */

import { Module } from '@nestjs/common';
import { drizzleProvider } from '../database/drizzle.provider.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

/** Предоставляет `GET /catalog/devices`. */
@Module({
  controllers: [CatalogController],
  providers: [CatalogService, drizzleProvider],
  exports: [CatalogService],
})
export class CatalogModule {}
