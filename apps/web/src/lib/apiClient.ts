// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/**
 * Типизированный клиент REST API NestJS (RULES § 1.6).
 *
 * Все ответы сервера имеют обёртку `{ success, data, message }`.
 * Полезная нагрузка проверяется соответствующей Zod-схемой из `@voltwirecraft/shared`.
 */

import { z } from 'zod';
import {
    AssemblePanelResultSchema,
    PueAuditReportSchema,
} from './aiContracts.js';
import type {
    AssemblePanelResult,
    PueAuditReport,
} from './aiContracts.js';
import {
    CadImportResultSchema,
    ProjectShortCircuitSchema,
} from './cadContracts.js';
import type {
    CadImportResult,
    ProjectShortCircuit,
} from './cadContracts.js';
import {
    CreateProjectDtoSchema,
    FloorPlanUploadDtoSchema,
    ProjectDtoSchema,
    UpdateProjectGraphDtoSchema,
    UuidSchema,
    type CreateProjectDto,
    type FloorPlanUploadDto,
    type ProjectDto,
    type ProjectGraph,
    type Uuid,
} from '@voltwirecraft/shared/graph.schema.js';

/** Обёртка любого ответа API. */
const ApiEnvelopeSchema = z.object({
    /** Признак успешности запроса. */
    success: z.boolean(),
    /** Полезная нагрузка; конкретная схема зависит от конечной точки. */
    data: z.unknown(),
    /** Человекочитаемое сообщение. */
    message: z.string(),
});

/** Базовый URL сервера по умолчанию. */
const DEFAULT_BASE_URL = 'http://localhost:3000';

/** Ошибка запроса к API. */
export class ApiClientError extends Error {
    /** HTTP-статус ответа; `502` означает некорректный ответ сервера. */
    readonly status: number;

    /**
     * @param message — сообщение об ошибке.
     * @param status — HTTP-статус ответа.
     */
    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiClientError';
        this.status = status;
    }
}

/** Параметры создания клиента API. */
export interface ApiClientOptions {
    /**
     * Базовый URL сервера.
     * По умолчанию переменная `VITE_API_URL`, затем `http://localhost:3000`.
     */
    readonly baseUrl?: string;
    /** Функция `fetch`; по умолчанию используется глобальный `fetch`. */
    readonly fetch?: typeof fetch;
}

/**
 * Проверить ответ сервера: статус, обёртку и полезную нагрузку.
 *
 * @param response — ответ `fetch`.
 * @param schema — Zod-схема полезной нагрузки.
 * @returns провалидированные данные.
 * @throws {ApiClientError} при ошибке HTTP, `success: false` или некорректном теле.
 */
async function parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
    if (!response.ok) {
        throw new ApiClientError(
            `Запрос к API завершился ошибкой ${response.status} ${response.statusText}`.trim(),
            response.status,
        );
    }

    let raw: unknown;
    try {
        raw = await response.json();
    } catch {
        throw new ApiClientError('Не удалось прочитать JSON ответа API', 502);
    }

    let envelope: z.infer<typeof ApiEnvelopeSchema>;
    try {
        envelope = ApiEnvelopeSchema.parse(raw);
    } catch {
        throw new ApiClientError('Некорректная обёртка ответа API', 502);
    }

    if (!envelope.success) {
        const message = envelope.message.length > 0 ? envelope.message : 'Ошибка API';
        throw new ApiClientError(message, response.status);
    }

    try {
        return schema.parse(envelope.data);
    } catch {
        throw new ApiClientError('Некорректные данные ответа API', 502);
    }
}

/**
 * Создать типизированный клиент API.
 *
 * @param options — базовый URL и/или функция `fetch`.
 * @returns объект с методами для работы с проектами.
 */
export function createApiClient(options: ApiClientOptions = {}) {
    // Переменные `import.meta.env` предоставляет Vite; в обычном Node их может не быть.
    const env = import.meta.env as unknown as Record<string, unknown> | undefined;
    const envUrl = typeof env?.VITE_API_URL === 'string' ? env.VITE_API_URL : undefined;
    const baseUrl = options.baseUrl ?? envUrl ?? DEFAULT_BASE_URL;
    const fetchFn: typeof fetch = options.fetch ?? globalThis.fetch.bind(globalThis);

    /**
     * Отправить JSON-запрос и разобрать ответ.
     * @param path — путь относительно базового URL.
     * @param method — HTTP-метод.
     * @param body — тело запроса.
     * @param schema — схема ответа.
     * @returns провалидированные данные ответа.
     */
    const sendJsonAsync = async <T>(
        path: string,
        method: 'POST' | 'PUT',
        body: unknown,
        schema: z.ZodType<T>,
    ): Promise<T> => {
        const response = await fetchFn(`${baseUrl}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return parseResponse(response, schema);
    };

    return {
        /**
         * Создать проект: `POST /projects`.
         * @param dto — данные нового проекта.
         * @returns созданный проект.
         */
        async createProjectAsync(dto: CreateProjectDto): Promise<ProjectDto> {
            const payload = CreateProjectDtoSchema.parse(dto);
            return sendJsonAsync('/projects', 'POST', payload, ProjectDtoSchema);
        },

        /**
         * Получить проект: `GET /projects/:id`.
         * @param id — идентификатор проекта.
         * @returns проект.
         */
        async getProjectAsync(id: Uuid): Promise<ProjectDto> {
            const projectId = UuidSchema.parse(id);
            const response = await fetchFn(
                `${baseUrl}/projects/${encodeURIComponent(projectId)}`,
                { method: 'GET' },
            );
            return parseResponse(response, ProjectDtoSchema);
        },

        /**
         * Сохранить граф проекта: `PUT /projects/:id/graph`.
         * @param id — идентификатор проекта.
         * @param graph — новый граф.
         * @returns обновлённый проект.
         */
        async updateProjectGraphAsync(id: Uuid, graph: ProjectGraph): Promise<ProjectDto> {
            const projectId = UuidSchema.parse(id);
            const payload = UpdateProjectGraphDtoSchema.parse({ graph });
            return sendJsonAsync(
                `/projects/${encodeURIComponent(projectId)}/graph`,
                'PUT',
                payload,
                ProjectDtoSchema,
            );
        },

        /**
         * Загрузить подложку плана этажа: `POST /projects/:id/floor-plans`.
         * @param id — идентификатор проекта.
         * @param file — файл подложки.
         * @returns данные загруженной подложки.
         */
        async uploadFloorPlanAsync(id: Uuid, file: File): Promise<FloorPlanUploadDto> {
            const projectId = UuidSchema.parse(id);
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetchFn(
                `${baseUrl}/projects/${encodeURIComponent(projectId)}/floor-plans`,
                { method: 'POST', body: formData },
            );
            return parseResponse(response, FloorPlanUploadDtoSchema);
        },

        /**
         * Автосборка щита ИИ-агентом: `POST /projects/:id/ai/assemble-panel`.
         * @param id — идентификатор проекта.
         * @param preferredBrand — предпочтительный бренд модулей.
         * @returns обновлённый граф, протокол и результат сборки щита.
         */
        async assemblePanelAsync(
            id: Uuid,
            preferredBrand?: 'IEK' | 'EKF' | 'КЭАЗ',
        ): Promise<AssemblePanelResult> {
            const projectId = UuidSchema.parse(id);
            const payload = preferredBrand === undefined ? {} : { preferredBrand };
            return sendJsonAsync(
                `/projects/${encodeURIComponent(projectId)}/ai/assemble-panel`,
                'POST',
                payload,
                AssemblePanelResultSchema,
            );
        },

        /**
         * Аудит проекта по ПУЭ-7: `POST /projects/:id/ai/audit-pue`.
         * @param id — идентификатор проекта.
         * @returns структурированный отчёт аудита.
         */
        async auditPueAsync(id: Uuid): Promise<PueAuditReport> {
            const projectId = UuidSchema.parse(id);
            return sendJsonAsync(
                `/projects/${encodeURIComponent(projectId)}/ai/audit-pue`,
                'POST',
                {},
                PueAuditReportSchema,
            );
        },

        /**
         * Импорт чертежа DXF/DWG: `POST /projects/:id/import-cad`.
         * @param id — идентификатор проекта.
         * @param file — файл чертежа.
         * @returns нормализованные слои стен.
         */
        async importCadAsync(id: Uuid, file: File): Promise<CadImportResult> {
            const projectId = UuidSchema.parse(id);
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetchFn(
                `${baseUrl}/projects/${encodeURIComponent(projectId)}/import-cad`,
                { method: 'POST', body: formData },
            );
            return parseResponse(response, CadImportResultSchema);
        },

        /**
         * Расчёт однофазного КЗ и селективности: `POST /projects/:id/short-circuit`.
         * @param id — идентификатор проекта.
         * @returns токи КЗ, потери напряжения и статус селективности.
         */
        async calculateShortCircuitAsync(id: Uuid): Promise<ProjectShortCircuit> {
            const projectId = UuidSchema.parse(id);
            return sendJsonAsync(
                `/projects/${encodeURIComponent(projectId)}/short-circuit`,
                'POST',
                {},
                ProjectShortCircuitSchema,
            );
        },
    };
}

/** Клиент API по умолчанию. */
export const apiClient = createApiClient();
