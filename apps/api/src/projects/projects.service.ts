// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Хранилище проектов: CRUD графа и загрузка подложек (RULES § 5.2, 6.5). */

import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
    createEmptyProjectGraph,
    FloorPlanUploadDtoSchema,
    ProjectDtoSchema,
    ProjectGraphSchema,
} from '@voltwirecraft/shared/graph.schema.js';
import type {
    CreateProjectDto,
    FloorPlanUploadDto,
    ProjectDto,
    ProjectGraph,
} from '@voltwirecraft/shared/graph.schema.js';
import { DRIZZLE_DB } from '../database/drizzle.provider.js';
import type { Database } from '../database/drizzle.provider.js';
import { floorPlans, projects } from '../database/schema.js';
import { detectFloorPlanType } from './file-signature.js';
import type { UploadedFloorPlanFile } from './file-signature.js';
import { FLOOR_PLAN_STORAGE } from './storage/floor-plan-storage.js';
import type { FloorPlanStorage } from './storage/floor-plan-storage.js';

/** Тип строки таблицы `projects`, возвращённой Drizzle. */
type ProjectRow = typeof projects.$inferSelect;

/**
 * Сервис проектов. Все обращения к БД и хранилищу имеют суффикс `Async`
 * (RULES § 1.4), зависимости внедряются только через конструктор (§ 1.3).
 */
@Injectable()
export class ProjectsService {
  /**
   * @param db — типизированный Drizzle-клиент.
   * @param storage — хранилище файлов подложек.
   */
  public constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(FLOOR_PLAN_STORAGE) private readonly storage: FloorPlanStorage,
  ) {}

  /**
   * Создаёт проект с пустым валидным графом.
   *
   * @param dto — название, тип объекта и система заземления.
   * @returns созданный проект с графом.
   * @throws {Error} если вставка в БД завершилась неудачей.
   */
  public async createAsync(dto: CreateProjectDto): Promise<ProjectDto> {
    const id = randomUUID();
    const graph = createEmptyProjectGraph(dto.title, id);
    const [row] = await this.db
      .insert(projects)
      .values({
        id,
        title: dto.title,
        objectType: dto.objectType,
        networkSystem: dto.networkSystem,
        graphJson: graph,
      })
      .returning();

    if (row === undefined) {
      throw new Error('Не удалось создать проект: база данных не вернула запись');
    }
    return this.mapToDto(row);
  }

  /**
   * Возвращает проект; граф из БД проверяется `ProjectGraphSchema`.
   *
   * @param id — идентификатор проекта.
   * @returns проект с валидированным графом.
   * @throws {NotFoundException} если проект не найден.
   * @throws {ZodError} если сохранённый граф не проходит валидацию.
   */
  public async getByIdAsync(id: string): Promise<ProjectDto> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (row === undefined) {
      throw new NotFoundException(`Проект ${id} не найден`);
    }
    return this.mapToDto(row);
  }

  /**
   * Сохраняет новый граф проекта.
   *
   * @param id — идентификатор проекта.
   * @param graph — граф, подлежащий валидации и записи в `graph_json`.
   * @returns обновлённый проект.
   * @throws {BadRequestException} если граф некорректен или его `id` не совпадает с проектом.
   * @throws {NotFoundException} если проект не найден.
   */
  public async updateGraphAsync(id: string, graph: ProjectGraph): Promise<ProjectDto> {
    const parsed = ProjectGraphSchema.safeParse(graph);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Граф проекта не прошёл валидацию',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    if (parsed.data.id !== id) {
      throw new BadRequestException('Идентификатор графа должен совпадать с идентификатором проекта');
    }

    const [row] = await this.db
      .update(projects)
      .set({ graphJson: parsed.data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();

    if (row === undefined) {
      throw new NotFoundException(`Проект ${id} не найден`);
    }
    return this.mapToDto(row);
  }

  /**
   * Загружает подложку в хранилище и записывает метаданные в БД.
   * MIME-тип определяется по magic bytes, а не по объявленному типу.
   *
   * @param id — идентификатор проекта.
   * @param file — файл из multipart-запроса.
   * @returns метаданные сохранённой подложки.
   * @throws {BadRequestException} если файл отсутствует, слишком велик или имеет неизвестный формат.
   * @throws {NotFoundException} если проект не найден.
   */
  public async uploadFloorPlanAsync(
    id: string,
    file: UploadedFloorPlanFile | undefined,
  ): Promise<FloorPlanUploadDto> {
    await this.getByIdAsync(id);

    if (file === undefined) {
      throw new BadRequestException('Файл подложки не передан');
    }

    const detected = detectFloorPlanType(file.buffer);
    const storageKey = `${randomUUID()}.${detected.kind}`;
    await this.storage.saveAsync(storageKey, file.buffer, detected.mimeType);

    const [row] = await this.db
      .insert(floorPlans)
      .values({
        projectId: id,
        storageKey,
        fileName: file.originalname,
        mimeType: detected.mimeType,
        kind: detected.kind,
        sizeBytes: file.size > 0 ? file.size : file.buffer.length,
      })
      .returning();

    if (row === undefined) {
      throw new Error('Не удалось сохранить подложку: база данных не вернула запись');
    }

    return FloorPlanUploadDtoSchema.parse({
      id: row.id,
      projectId: row.projectId,
      storageKey: row.storageKey,
      fileName: row.fileName,
      kind: row.kind,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
    });
  }

  /**
   * Преобразует строку БД в DTO и проверяет граф на границе вывода.
   *
   * @param row — строка таблицы `projects`.
   * @returns провалидированный DTO проекта.
   */
  private mapToDto(row: ProjectRow): ProjectDto {
    return ProjectDtoSchema.parse({
      id: row.id,
      title: row.title,
      objectType: row.objectType,
      networkSystem: row.networkSystem,
      graph: ProjectGraphSchema.parse(row.graphJson),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
}
