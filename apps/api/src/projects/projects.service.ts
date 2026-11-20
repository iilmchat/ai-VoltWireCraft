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
    SelectivityTccRequestSchema,
    ShortCircuitRequestSchema,
} from '@voltwirecraft/shared/graph.schema.js';
import type {
    CreateProjectDto,
    FloorPlanUploadDto,
    ProjectDto,
    ProjectGraph,
    SelectivityTccResponse,
    ShortCircuitResponse,
} from '@voltwirecraft/shared/graph.schema.js';
import { CalcEngineClient } from '../calc-engine/calc-engine.client.js';
import { DRIZZLE_DB } from '../database/drizzle.provider.js';
import type { Database } from '../database/drizzle.provider.js';
import { floorPlans, projects } from '../database/schema.js';
import { buildCableRequest, ProjectCalculationDtoSchema } from './calculation.js';
import type { CalculationEdge, ProjectCalculationDto } from './calculation.js';
import { buildSelectivityRequest } from './selectivity.js';
import { detectCadFile, detectFloorPlanType } from './file-signature.js';
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
   * @param calcClient — клиент детерминированного расчётного ядра.
   */
  public constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(FLOOR_PLAN_STORAGE) private readonly storage: FloorPlanStorage,
    @Inject(CalcEngineClient) private readonly calcClient: CalcEngineClient,
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
   * Прогоняет все кабельные линии графа через расчётное ядро.
   * Линии рассчитываются независимо: отказ одной не прерывает остальные
   * (RULES § 4.13). Математика выполняется только в calc-engine (RULES § 5.1).
   *
   * @param id — идентификатор проекта.
   * @returns суммарная длина и статус каждой линии.
   * @throws {NotFoundException} если проект не найден.
   */
  public async calculateAsync(id: string): Promise<ProjectCalculationDto> {
    const project = await this.getByIdAsync(id);
    const edges = project.graph.edges;

    const results = await Promise.allSettled(
      edges.map(async (edge) =>
        this.calcClient.calculateCableLengthAsync(buildCableRequest(project.graph, edge)),
      ),
    );

    const calculated: CalculationEdge[] = edges.map((edge, index) => {
      const result = results[index];
      if (result?.status === 'fulfilled') {
        return { edgeId: edge.id, status: 'ok', lengthM: result.value.lengthM };
      }
      return {
        edgeId: edge.id,
        status: 'error',
        error:
          result?.status === 'rejected'
            ? String(result.reason)
            : 'Неизвестная ошибка расчёта линии',
      };
    });

    const totalLengthM = calculated.reduce((sum, item) => sum + (item.lengthM ?? 0), 0);
    return ProjectCalculationDtoSchema.parse({ projectId: id, totalLengthM, edges: calculated });
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
   * Проверяет петлю «фаза-ноль» для первой линии проекта в расчётном ядре.
   *
   * @param id — идентификатор проекта.
   * @returns результат расчёта однофазного КЗ.
   * @throws {BadRequestException} если в графе нет линии или автомата.
   */
  public async calculateShortCircuitAsync(id: string): Promise<ShortCircuitResponse> {
    const project = await this.getByIdAsync(id);
    const edge = project.graph.edges[0];
    const breaker = project.graph.nodes.find(
      (node) => ['circuit_breaker', 'rcbo', 'panel'].includes(node.kind) && node.specs.ratedCurrent > 0,
    );
    if (edge === undefined || breaker === undefined) {
      throw new BadRequestException('В проекте должна быть хотя бы одна линия с автоматом');
    }

    return this.calcClient.checkShortCircuitAsync(
      ShortCircuitRequestSchema.parse({
        transformerPowerKva: 100,
        cableLengthM: edge.cableSpecs.length > 0 ? edge.cableSpecs.length : 10,
        crossSectionMm2: edge.cableSpecs.crossSection,
        breakerRatingA: breaker.specs.ratedCurrent,
        tripCurve: 'C',
      }),
    );
  }

  /**
   * Проверяет селективность цепочки ВРУ → ЩР по ВТХ в расчётном ядре.
   * Все числа приходят из calc-engine (RULES § 5.1).
   *
   * @param id — идентификатор проекта.
   * @returns протокол ВТХ с пределами селективности и каскадной потерей напряжения.
   * @throws {NotFoundException} если проект не найден.
   */
  public async checkSelectivityTccAsync(id: string): Promise<SelectivityTccResponse> {
    const project = await this.getByIdAsync(id);
    const request = SelectivityTccRequestSchema.parse(buildSelectivityRequest(project.graph));
    return this.calcClient.checkSelectivityTccAsync(request);
  }

  /**
   * Импортирует стены из DXF-плана в граф проекта через calc-engine.
   * DWG требует внешний ODA-конвертер и пока отклоняется с явным сообщением.
   *
   * @param id — идентификатор проекта.
   * @param file — загруженный DXF/DWG (до 50 МБ).
   * @returns проект с добавленными стенами.
   * @throws {BadRequestException} если формат не поддержан или файл слишком велик.
   * @throws {NotFoundException} если проект не найден.
   */
  public async importCadAsync(id: string, file: UploadedFloorPlanFile): Promise<ProjectDto> {
    const project = await this.getByIdAsync(id);
    // DXF и DWG принимаются: конвертацию DWG → DXF выполняет calc-engine (KI-005).
    detectCadFile(file);

    const parsed = await this.calcClient.parseDxfAsync({
      bytes: file.buffer,
      fileName: file.originalname,
    });
    const walls = parsed.walls.map((wall) => ({
      id: randomUUID(),
      kind: wall.kind,
      path: wall.path,
      thickness: wall.thickness,
    }));

    return this.updateGraphAsync(id, {
      ...project.graph,
      walls: [...project.graph.walls, ...walls],
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
