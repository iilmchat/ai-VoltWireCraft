// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Подбор реальных артикулов модульного оборудования из `catalog_devices`. */

import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte } from 'drizzle-orm';
import { DRIZZLE_DB } from '../database/drizzle.provider.js';
import type { Database } from '../database/drizzle.provider.js';
import { catalogDevices } from '../database/schema.js';

/** Выбранная позиция каталога. */
export interface CatalogSelection {
  /** Артикул производителя. */
  readonly sku: string;
  /** Бренд. */
  readonly brand: string;
  /** Наименование. */
  readonly name: string;
  /** Тип устройства. */
  readonly deviceType: string;
  /** Номинальный ток, A. */
  readonly ratedCurrentA: number | null;
  /** Ширина в 18-мм модулях. */
  readonly widthModules: number | null;
}

/**
 * Сервис каталога: ищет позицию по типу устройства, бренду и номиналу.
 * Результат — только справочные данные; расчёты выполняет `calc-engine`.
 */
@Injectable()
export class CatalogService {
  /**
   * @param db — типизированный Drizzle-клиент.
   */
  public constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /**
   * Возвращает подходящий артикул; при отсутствии бренда — первый по номиналу.
   *
   * @param deviceType — тип устройства (`circuit_breaker`, `rcd`, `rcbo`, `panel`).
   * @param brand — предпочтительный бренд.
   * @param minCurrentA — минимальный номинальный ток.
   * @returns позиция каталога или `null`.
   */
  public async findByTypeAsync(
    deviceType: string,
    brand: string | undefined,
    minCurrentA: number | undefined,
  ): Promise<CatalogSelection | null> {
    const rows = await this.db
      .select({
        sku: catalogDevices.sku,
        brand: catalogDevices.brand,
        name: catalogDevices.name,
        deviceType: catalogDevices.deviceType,
        ratedCurrentA: catalogDevices.ratedCurrentA,
        widthModules: catalogDevices.widthModules,
      })
      .from(catalogDevices)
      .where(
        and(
          eq(catalogDevices.deviceType, deviceType as (typeof catalogDevices.deviceType.enumValues)[number]),
          ...(minCurrentA !== undefined && minCurrentA > 0
            ? [gte(catalogDevices.ratedCurrentA, minCurrentA)]
            : []),
        ),
      )
      .orderBy(asc(catalogDevices.ratedCurrentA))
      .limit(20);

    const preferred = brand === undefined ? undefined : rows.find((row) => row.brand === brand);
    const selected = preferred ?? rows[0];
    if (selected === undefined) {
      return null;
    }
    return selected;
  }
}
