// © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
/** Сервис публичного каталога оборудования (RULES § 5.1: только справочные данные). */

import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DRIZZLE_DB } from '../database/drizzle.provider.js';
import type { Database } from '../database/drizzle.provider.js';
import { catalogDevices } from '../database/schema.js';
import { CatalogListDtoSchema } from './catalog.dto.js';
import type { CatalogListDto, CatalogQuery } from './catalog.dto.js';

/** Сервис фильтрации и постраничной выдачи каталога. */
@Injectable()
export class CatalogService {
  /**
   * @param db — типизированный Drizzle-клиент.
   */
  public constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /**
   * Возвращает страницу каталога с фильтрами по бренду, типу и номинальному току.
   *
   * @param query — валидированные параметры запроса.
   * @returns постраничный список, проверенный Zod на границе вывода.
   */
  public async listAsync(query: CatalogQuery): Promise<CatalogListDto> {
    const filters = [
      ...(query.brand === undefined ? [] : [eq(catalogDevices.brand, query.brand)]),
      ...(query.deviceType === undefined ? [] : [eq(catalogDevices.deviceType, query.deviceType)]),
      ...(query.ratedCurrentA === undefined
        ? []
        : [eq(catalogDevices.ratedCurrentA, query.ratedCurrentA)]),
    ];
    const where = filters.length === 0 ? undefined : and(...filters);
    const offset = (query.page - 1) * query.pageSize;

    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(catalogDevices)
        .where(where)
        .orderBy(asc(catalogDevices.sku))
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ value: sql<number>`count(*)::int` })
        .from(catalogDevices)
        .where(where),
    ]);

    return CatalogListDtoSchema.parse({
      items: rows,
      total: totals[0]?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
