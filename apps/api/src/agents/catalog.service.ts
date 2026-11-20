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
  /** Число полюсов (`1P` … `4P`). */
  readonly poles: string | null;
  /** Уставка дифференциального тока, мА. */
  readonly leakageCurrentMa: number | null;
}

/** Дополнительные фильтры подбора оборудования. */
export interface CatalogLookupOptions {
  /** Требуемое число полюсов, например `3P` или `4P`. */
  readonly poles?: string;
  /** Требуемая уставка УЗО, мА. */
  readonly leakageMa?: number;
  /** Требуется ли селективное исполнение типа `S`. */
  readonly sType?: boolean;
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
   * @param options — фильтры по числу полюсов и уставке УЗО.
   * @returns позиция каталога или `null`.
   */
  public async findByTypeAsync(
    deviceType: string,
    brand: string | undefined,
    minCurrentA: number | undefined,
    options: CatalogLookupOptions = {},
  ): Promise<CatalogSelection | null> {
    const rows = await this.db
      .select({
        sku: catalogDevices.sku,
        brand: catalogDevices.brand,
        name: catalogDevices.name,
        deviceType: catalogDevices.deviceType,
        ratedCurrentA: catalogDevices.ratedCurrentA,
        widthModules: catalogDevices.widthModules,
        poles: catalogDevices.poles,
        leakageCurrentMa: catalogDevices.leakageCurrentMa,
        specsJson: catalogDevices.specsJson,
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
      .limit(50);

    const filtered = rows.filter((row) => {
      if (options.poles !== undefined && row.poles !== options.poles) {
        return false;
      }
      if (options.leakageMa !== undefined && row.leakageCurrentMa !== options.leakageMa) {
        return false;
      }
      if (options.sType === true && row.specsJson['tripType'] !== 'S') {
        return false;
      }
      return true;
    });

    const preferred = brand === undefined ? undefined : filtered.find((row) => row.brand === brand);
    const selected = preferred ?? filtered[0];
    if (selected === undefined) {
      return null;
    }
    return selected;
  }
}
