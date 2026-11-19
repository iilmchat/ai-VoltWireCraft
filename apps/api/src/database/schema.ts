// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Схема базы данных VoltWireCraft в терминах Drizzle ORM (RULES § 4.9, 4.16). */

import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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

/** Объекты схемы для передачи Drizzle. */
export const schema = { projects, floorPlans };
