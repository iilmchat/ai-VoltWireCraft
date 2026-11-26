// © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
/** Публичный REST-контроллер каталога оборудования (RULES § 1.6). */

import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { ApiResponse } from '../common/api-response.js';
import { CatalogQuerySchema } from './catalog.dto.js';
import type { CatalogListDto, CatalogQuery } from './catalog.dto.js';
// Импорт нужен как значение: emitDecoratorMetadata использует его для DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CatalogService } from './catalog.service.js';
import { Public } from '../auth/public.decorator.js';

/** Маршруты каталога модульного оборудования. */
@Controller('catalog')
export class CatalogController {
  /**
   * @param service — сервис каталога.
   */
  public constructor(private readonly service: CatalogService) {}

  /**
   * Возвращает постраничный список позиций с фильтрами.
   *
   * @param query — валидированные параметры строки запроса.
   * @returns список в единой обёртке `ApiResponse`.
   */
  @Get('devices')
  @Public()
  public async listAsync(
    @Query(new ZodValidationPipe(CatalogQuerySchema)) query: CatalogQuery,
  ): Promise<ApiResponse<CatalogListDto>> {
    const data = await this.service.listAsync(query);
    return { success: true, data, message: 'Каталог получен' };
  }
}
