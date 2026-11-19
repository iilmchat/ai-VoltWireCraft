// © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
/** Контракты публичного API каталога оборудования (RULES § 1.12). */

import { z } from 'zod';
import {
  CATALOG_DEVICE_TYPES,
  DEVICE_BRANDS,
  DEVICE_POLES,
  TRIP_CURVES,
} from '../database/schema.js';

/** Параметры запроса `GET /catalog/devices`. */
export const CatalogQuerySchema = z.object({
  /** Бренд производителя. */
  brand: z.enum(DEVICE_BRANDS).optional(),
  /** Тип устройства. */
  deviceType: z.enum(CATALOG_DEVICE_TYPES).optional(),
  /** Точный номинальный ток, А. */
  ratedCurrentA: z.coerce.number().int().positive().optional(),
  /** Номер страницы (с единицы). */
  page: z.coerce.number().int().positive().default(1),
  /** Размер страницы, не более 100. */
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
/** Тип параметров запроса каталога. */
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;

/** Позиция каталога в ответе API. */
export const CatalogDeviceDtoSchema = z.object({
  /** Идентификатор позиции. */
  id: z.uuid(),
  /** Бренд. */
  brand: z.enum(DEVICE_BRANDS),
  /** Серия. */
  series: z.string(),
  /** Артикул. */
  sku: z.string(),
  /** Наименование. */
  name: z.string(),
  /** Тип устройства. */
  deviceType: z.enum(CATALOG_DEVICE_TYPES),
  /** Число полюсов. */
  poles: z.enum(DEVICE_POLES).nullable(),
  /** Номинальный ток, А. */
  ratedCurrentA: z.number().int().nullable(),
  /** Тип расцепителя. */
  tripCurve: z.enum(TRIP_CURVES).nullable(),
  /** Уставка тока утечки, мА. */
  leakageCurrentMa: z.number().int().nullable(),
  /** Коммутационная способность, кА (строка `numeric`). */
  breakingCapacityKa: z.string().nullable(),
  /** Ширина в 18-мм модулях. */
  widthModules: z.number().int().nullable(),
  /** Цена, руб. (строка `numeric`). */
  priceRub: z.string(),
  /** Дополнительные характеристики. */
  specsJson: z.record(z.string(), z.unknown()),
});
/** Тип позиции каталога. */
export type CatalogDeviceDto = z.infer<typeof CatalogDeviceDtoSchema>;

/** Постраничный список каталога. */
export const CatalogListDtoSchema = z.object({
  /** Позиции текущей страницы. */
  items: z.array(CatalogDeviceDtoSchema),
  /** Общее число позиций, удовлетворяющих фильтру. */
  total: z.number().int().nonnegative(),
  /** Текущая страница. */
  page: z.number().int().positive(),
  /** Размер страницы. */
  pageSize: z.number().int().positive(),
});
/** Тип постраничного списка каталога. */
export type CatalogListDto = z.infer<typeof CatalogListDtoSchema>;
