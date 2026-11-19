// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Интеграционные тесты ProjectsService: реальная PostgreSQL-совместимая БД (PGlite). */

import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { ZodError } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createEmptyProjectGraph,
    type CreateProjectDto,
    type ProjectGraph,
} from '@voltwirecraft/shared/graph.schema.js';
import { CalcEngineClient } from '../src/calc-engine/calc-engine.client.js';
import { DRIZZLE_DB } from '../src/database/drizzle.provider.js';
import type { Database } from '../src/database/drizzle.provider.js';
import { schema } from '../src/database/schema.js';
import { MAX_FLOOR_PLAN_SIZE_BYTES } from '../src/projects/file-signature.js';
import { FLOOR_PLAN_STORAGE } from '../src/projects/storage/floor-plan-storage.js';
import type { FloorPlanStorage } from '../src/projects/storage/floor-plan-storage.js';
import { ProjectsService } from '../src/projects/projects.service.js';

/** Запись журнала миграций Drizzle. */
interface MigrationEntry {
  readonly tag: string;
  readonly idx: number;
  readonly version: string;
  readonly when: number;
  readonly breakpoints: readonly boolean[];
}

/** Содержимое `meta/_journal.json`. */
interface MigrationJournal {
  readonly entries: readonly MigrationEntry[];
}

/** Тестовое хранилище, запоминающее вызовы без записи на диск. */
class FakeStorage implements FloorPlanStorage {
  public readonly saved: Array<{ key: string; bytes: Buffer; contentType: string }> = [];

  /** @inheritdoc */
  public async saveAsync(key: string, bytes: Buffer, contentType: string): Promise<void> {
    this.saved.push({ key, bytes, contentType });
  }
}

const DTO: CreateProjectDto = {
  title: 'Дом ИЖС',
  objectType: 'house',
  networkSystem: 'tn-s',
};

const PDF_BYTES = Buffer.from('%PDF-1.7\n%тестовая подложка\n%%EOF', 'utf8');
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const migrationsFolder = fileURLToPath(new URL('../src/database/migrations', import.meta.url));

/**
 * Применяет сгенерированные Drizzle-миграции к экземпляру PGlite.
 *
 * @param client — встроенный экземпляр PostgreSQL.
 * @returns nothing.
 */
async function applyMigrationsAsync(client: PGlite): Promise<void> {
  const journalPath = join(migrationsFolder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as MigrationJournal;

  for (const entry of journal.entries) {
    const sql = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      // PGlite не поддерживает расширение pgvector: пропускаем операторы vector,
      // чтобы проверить миграции projects/floor_plans/catalog_devices.
      if (/vector/i.test(statement) || /normative_chunks/.test(statement)) {
        continue;
      }
      await client.exec(statement);
    }
  }
}

describe('ProjectsService (интеграционные тесты)', () => {
  let client: PGlite;
  let service: ProjectsService;
  let storage: FakeStorage;

  beforeAll(async () => {
    client = new PGlite();
    await applyMigrationsAsync(client);

    storage = new FakeStorage();
    const db = drizzle(client, { schema });
    const module = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: DRIZZLE_DB, useValue: db as unknown as Database },
        { provide: FLOOR_PLAN_STORAGE, useValue: storage },
        { provide: CalcEngineClient, useValue: { calculateCableLengthAsync: async () => ({ lengthM: 1 }) } },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  afterAll(async () => {
    await client.close();
  });

  it('сгенерированные миграции создают таблицы projects и floor_plans', async () => {
    const result = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const names = result.rows.map((row) => row.table_name);

    expect(names).toContain('projects');
    expect(names).toContain('floor_plans');
    expect(names).toContain('catalog_devices');
  });

  it('создаёт проект с пустым валидным графом', async () => {
    const created = await service.createAsync(DTO);

    expect(created.title).toBe(DTO.title);
    expect(created.objectType).toBe(DTO.objectType);
    expect(created.networkSystem).toBe(DTO.networkSystem);
    expect(created.graph.id).toBe(created.id);
    expect(created.graph.schemaVersion).toBe(2);
    expect(created.graph.floorPlan.background).toBeNull();
    expect(created.graph.rooms).toEqual([]);
    expect(created.graph.nodes).toEqual([]);
    expect(created.graph.edges).toEqual([]);
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
  });

  it('возвращает сохранённый проект по идентификатору', async () => {
    const created = await service.createAsync(DTO);
    const loaded = await service.getByIdAsync(created.id);

    expect(loaded).toEqual(created);
  });

  it('выбрасывает NotFoundException для несуществующего проекта', async () => {
    await expect(service.getByIdAsync(randomUUID())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('выбрасывает ZodError, если граф в БД повреждён', async () => {
    const created = await service.createAsync(DTO);
    await client.query("UPDATE projects SET graph_json = '{}'::jsonb WHERE id = $1", [created.id]);

    await expect(service.getByIdAsync(created.id)).rejects.toBeInstanceOf(ZodError);
  });

  it('сохраняет обновлённый граф и поднимает updated_at', async () => {
    const created = await service.createAsync(DTO);
    const graph: ProjectGraph = {
      ...createEmptyProjectGraph(DTO.title, created.id),
      floorPlan: {
        background: null,
        scaleMetersPerPx: 0.01,
        ceilingHeightM: 2.7,
      },
      nodes: [
        {
          id: randomUUID(),
          kind: 'socket',
          label: 'Розетка Р1',
          planPosition: { x: 1, y: 2 },
          panelSlot: null,
          specs: { ratedPower: 0, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0.3 },
        },
      ],
    };

    const updated = await service.updateGraphAsync(created.id, graph);
    const loaded = await service.getByIdAsync(created.id);

    expect(updated.graph.nodes).toHaveLength(1);
    expect(loaded.graph).toEqual(graph);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    );
  });

  it('отвергает граф со ссылкой на несуществующий узел', async () => {
    const created = await service.createAsync(DTO);
    const graph: ProjectGraph = {
      ...createEmptyProjectGraph(DTO.title, created.id),
      edges: [
        {
          id: randomUUID(),
          from: randomUUID(),
          to: randomUUID(),
          cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu', length: 0 },
          waypointsM: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
    };

    await expect(service.updateGraphAsync(created.id, graph)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('отвергает граф с чужим идентификатором', async () => {
    const created = await service.createAsync(DTO);

    await expect(
      service.updateGraphAsync(created.id, createEmptyProjectGraph(DTO.title)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['PDF', PDF_BYTES, 'pdf', 'application/pdf'],
    ['PNG', PNG_BYTES, 'png', 'image/png'],
    ['JPG', JPG_BYTES, 'jpg', 'image/jpeg'],
  ])('загружает подложку %s по magic bytes', async (_name, bytes, kind, mimeType) => {
    const created = await service.createAsync(DTO);
    storage.saved.length = 0;

    const result = await service.uploadFloorPlanAsync(created.id, {
      buffer: bytes,
      originalname: `plan.${kind === 'jpg' ? 'jpg' : kind}`,
      size: bytes.length,
    });

    expect(result.kind).toBe(kind);
    expect(result.mimeType).toBe(mimeType);
    expect(result.projectId).toBe(created.id);
    expect(result.sizeBytes).toBe(bytes.length);
    expect(storage.saved).toHaveLength(1);
    expect(storage.saved[0]?.bytes).toEqual(bytes);
    expect(storage.saved[0]?.key).toMatch(/\.(pdf|png|jpg)$/);

    const rows = await dbSelectFloorPlans(client, created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.storage_key).toBe(result.storageKey);
  });

  it('отвергает файл с неизвестной сигнатурой', async () => {
    const created = await service.createAsync(DTO);
    storage.saved.length = 0;

    await expect(
      service.uploadFloorPlanAsync(created.id, {
        buffer: Buffer.from('GIF89a.........'),
        originalname: 'plan.gif',
        size: 15,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.saved).toHaveLength(0);
  });

  it('отвергает файл больше 25 МБ', async () => {
    const created = await service.createAsync(DTO);
    const bytes = Buffer.alloc(MAX_FLOOR_PLAN_SIZE_BYTES + 1, 0x25);

    await expect(
      service.uploadFloorPlanAsync(created.id, {
        buffer: bytes,
        originalname: 'huge.pdf',
        size: bytes.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отвергает запрос без файла', async () => {
    const created = await service.createAsync(DTO);

    await expect(service.uploadFloorPlanAsync(created.id, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('каскадно удаляет подложки при удалении проекта', async () => {
    const created = await service.createAsync(DTO);
    await service.uploadFloorPlanAsync(created.id, {
      buffer: PDF_BYTES,
      originalname: 'plan.pdf',
      size: PDF_BYTES.length,
    });
    await client.query('DELETE FROM projects WHERE id = $1', [created.id]);

    const rows = await dbSelectFloorPlans(client, created.id);
    expect(rows).toHaveLength(0);
  });
});

/**
 * Возвращает записи о подложках проекта.
 *
 * @param client — клиент PGlite.
 * @param projectId — идентификатор проекта.
 * @returns строки таблицы `floor_plans`.
 */
async function dbSelectFloorPlans(
  client: PGlite,
  projectId: string,
): Promise<Array<{ storage_key: string }>> {
  const result = await client.query<{ storage_key: string }>(
    'SELECT storage_key FROM floor_plans WHERE project_id = $1',
    [projectId],
  );
  return result.rows;
}
