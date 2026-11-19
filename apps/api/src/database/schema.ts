// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Схема базы данных VoltWireCraft в терминах Drizzle ORM (RULES § 4.9, 4.16). */

import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import type { ProjectGraph } from '@voltwirecraft/shared/graph.schema.js';

/** Тип объекта недвижимости — зеркало `ObjectTypeSchema`. */
export const OBJECT_TYPES = ['house', 'apartment', 'commercial'] as const;
/** Система заземления — зеркало `NetworkSystemSchema`. */
export const NETWORK_SYSTEMS = ['tn-s', 'tn-c-s', 'tn-c', 'tt', 'it'] as const;
/** Формат загруженной подложки — зеркало `BackgroundKindSchema`. */
export const FLOOR_PLAN_KINDS = ['pdf', 'png', 'jpg'] as const;

/**
 * Проект: метаданные и граф целиком в колонке `graph_json`.
 * Имена колонок — `snake_case`, имена полей TypeScript — `camelCase`.
 */
export const projects = pgTable('projects', {
  /** Идентификатор проекта (UUID). */
  id: uuid('id').primaryKey().defaultRandom(),
  /** Название проекта. */
  title: text('title').notNull(),
  /** Тип объекта. */
  objectType: text('object_type', { enum: OBJECT_TYPES }).notNull(),
  /** Система заземления. */
  networkSystem: text('network_system', { enum: NETWORK_SYSTEMS }).notNull(),
  /** Граф проекта, валидируется `ProjectGraphSchema` на границе. */
  graphJson: jsonb('graph_json').$type<ProjectGraph>().notNull(),
  /** Время создания. */
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Время последнего обновления. */
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Загруженная подложка плана этажа (файл лежит в S3 или локально). */
export const floorPlans = pgTable('floor_plans', {
  /** Идентификатор записи. */
  id: uuid('id').primaryKey().defaultRandom(),
  /** Проект-владелец; удаление проекта каскадно удаляет записи (RULES § 4.10). */
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  /** Ключ объекта в хранилище. */
  storageKey: text('storage_key').notNull().unique(),
  /** Оригинальное имя файла. */
  fileName: text('file_name').notNull(),
  /** MIME-тип, подтверждённый по magic bytes. */
  mimeType: text('mime_type').notNull(),
  /** Формат файла. */
  kind: text('kind', { enum: FLOOR_PLAN_KINDS }).notNull(),
  /** Размер файла в байтах. */
  sizeBytes: integer('size_bytes').notNull(),
  /** Время загрузки. */
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Бренды модульного оборудования в каталоге (RULES § 1.13). */
export const DEVICE_BRANDS = ['IEK', 'EKF', 'КЭАЗ', 'ABB', 'Schneider Electric', 'Legrand'] as const;
/** Типы устройств каталога. */
export const CATALOG_DEVICE_TYPES = [
  'circuit_breaker',
  'rcd',
  'rcbo',
  'relay_voltage',
  'contactor',
  'panel',
] as const;
/** Число полюсов устройства. */
export const DEVICE_POLES = ['1P', '2P', '3P', '4P'] as const;
/** Тип расцепителя автоматического выключателя. */
export const TRIP_CURVES = ['B', 'C', 'D'] as const;
/** Уставка тока утечки УЗО/АВДТ, мА. */
export const LEAKAGE_CURRENTS_MA = [10, 30, 100, 300] as const;
/** Коммутационная способность, кА. */
export const BREAKING_CAPACITIES_KA = [4.5, 6, 10] as const;
/** Ширина модульного устройства в модулях (18 мм на модуль). */
export const WIDTH_MODULES = [1, 2, 3, 4] as const;
/** Размерность эмбеддингов модели `text-embedding-3-small`. */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Каталог модульного оборудования: справочник для подбора ЭУИ и НКУ.
 * Цены хранятся в рублях (`numeric`), физические величины — в СИ (RULES § 5.3).
 */
export const catalogDevices = pgTable(
  'catalog_devices',
  {
    /** Идентификатор позиции каталога. */
    id: uuid('id').primaryKey().defaultRandom(),
    /** Производитель. */
    brand: text('brand', { enum: DEVICE_BRANDS }).notNull(),
    /** Серия устройства. */
    series: text('series').notNull(),
    /** Артикул производителя, уникален в каталоге. */
    sku: text('sku').notNull().unique(),
    /** Наименование позиции. */
    name: text('name').notNull(),
    /** Тип устройства. */
    deviceType: text('device_type', { enum: CATALOG_DEVICE_TYPES }).notNull(),
    /** Число полюсов; `null` для корпусов и кросс-модулей. */
    poles: text('poles', { enum: DEVICE_POLES }),
    /** Номинальный ток, А. */
    ratedCurrentA: integer('rated_current_a'),
    /** Тип расцепителя; `null`, если неприменимо. */
    tripCurve: text('trip_curve', { enum: TRIP_CURVES }),
    /** Уставка тока утечки, мА; `null`, если неприменимо. */
    leakageCurrentMa: integer('leakage_current_ma'),
    /** Коммутационная способность, кА. */
    breakingCapacityKa: numeric('breaking_capacity_ka', { precision: 4, scale: 1 }),
    /** Ширина в 18-мм модулях; `null` для корпусов (их ёмкость — в `specs_json`). */
    widthModules: integer('width_modules'),
    /** Цена, руб. */
    priceRub: numeric('price_rub', { precision: 12, scale: 2 }).notNull(),
    /** Дополнительные характеристики (ёмкость щита, частота, класс и т. д.). */
    specsJson: jsonb('specs_json').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    /** Быстрый подбор по типу и бренду. */
    index('catalog_devices_type_brand_idx').on(table.deviceType, table.brand),
  ],
);

/**
 * Фрагменты нормативной документации для RAG (ПУЭ-7, СП 256).
 * Вектор `embedding` хранится средствами pgvector; до поиска необходимо
 * включить расширение `vector` (добавлено в миграции).
 */
export const normativeChunks = pgTable(
  'normative_chunks',
  {
    /** Идентификатор фрагмента. */
    id: uuid('id').primaryKey().defaultRandom(),
    /** Код документа, например `ПУЭ-7` или `СП 256.1325800.2016`. */
    documentCode: text('document_code').notNull(),
    /** Номер пункта, например `7.1.79`. */
    clause: text('clause').notNull(),
    /** Текст фрагмента. */
    content: text('content').notNull(),
    /** Эмбеддинг для cosine-поиска. */
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    /** Происхождение, номер издания, страница и прочие метаданные. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    /** Один пункт документа — одна запись. */
    uniqueIndex('normative_chunks_document_clause_key').on(table.documentCode, table.clause),
    /** Индекс HNSW для приближённого поиска по косинусной близости. */
    index('normative_chunks_embedding_hnsw_idx').using(
      'hnsw',
      sql`${table.embedding} vector_cosine_ops`,
    ),
  ],
);

/** Объекты схемы для передачи Drizzle. */
export const schema = { projects, floorPlans, catalogDevices, normativeChunks };
