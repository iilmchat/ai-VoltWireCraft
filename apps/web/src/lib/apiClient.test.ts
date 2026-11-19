// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { describe, expect, it, vi } from 'vitest';
import type {
    CreateProjectDto,
    FloorPlanUploadDto,
    ProjectDto,
    ProjectGraph,
    Uuid,
} from '@voltwirecraft/shared/graph.schema.js';
import { apiClient, ApiClientError, createApiClient } from './apiClient.js';

const BASE_URL = 'http://example.test';
const PROJECT_ID: Uuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GRAPH_ID: Uuid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UPLOAD_ID: Uuid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** Канонический валидный граф проекта. */
const validGraph: ProjectGraph = {
    schemaVersion: 1,
    id: GRAPH_ID,
    name: 'Тестовый проект',
    floorPlan: {
        background: null,
        scaleMetersPerPx: null,
        ceilingHeightM: 2.7,
    },
    rooms: [],
    walls: [],
    nodes: [],
    edges: [],
};

/** Канонический валидный DTO проекта. */
const validProjectDto: ProjectDto = {
    id: PROJECT_ID,
    title: 'Тестовый проект',
    objectType: 'house',
    networkSystem: 'tn-s',
    graph: validGraph,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
};

/** Тело запроса создания проекта. */
const createDto: CreateProjectDto = {
    title: 'Тестовый проект',
    objectType: 'house',
    networkSystem: 'tn-s',
};

/** Канонический валидный DTO загрузки подложки. */
const validUploadDto: FloorPlanUploadDto = {
    id: UPLOAD_ID,
    projectId: PROJECT_ID,
    storageKey: 'floor-plans/plan.png',
    fileName: 'plan.png',
    kind: 'png',
    mimeType: 'image/png',
    sizeBytes: 1024,
    createdAt: '2026-01-01T00:00:00.000Z',
};

/** Успешный ответ API с заданными данными. */
function okResponse(data: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: 'OK',
        json: async () => ({ success: true, data, message: 'ok' }),
    } as unknown as Response;
}

/** Нетипизированный ответ, созданный через приведение к `Response`. */
function rawResponse(value: unknown): Response {
    return value as unknown as Response;
}

describe('apiClient', () => {
    it('создаёт проект и возвращает провалидированные данные', async () => {
        const fakeFetch = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
                okResponse(validProjectDto),
        );
        const client = createApiClient({ baseUrl: BASE_URL, fetch: fakeFetch });

        await expect(client.createProjectAsync(createDto)).resolves.toEqual(validProjectDto);

        expect(fakeFetch).toHaveBeenCalledTimes(1);
        const [url, init] = fakeFetch.mock.calls[0] ?? [];
        expect(url).toBe(`${BASE_URL}/projects`);
        expect(init?.method).toBe('POST');
        expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
        const body: unknown = JSON.parse(String(init?.body));
        expect(body).toEqual(createDto);
    });

    it('отвергает ответ с некорректными данными', async () => {
        const fakeFetch = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
                okResponse({ id: validProjectDto.id }),
        );
        const client = createApiClient({ baseUrl: BASE_URL, fetch: fakeFetch });

        const promise = client.getProjectAsync(PROJECT_ID);
        await expect(promise).rejects.toBeInstanceOf(ApiClientError);
        await expect(promise).rejects.toMatchObject({
            status: 502,
            message: expect.stringContaining('Некорректные данные'),
        });
    });

    it('передаёт HTTP-статус ошибки через ApiClientError', async () => {
        const fakeFetch = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
                rawResponse({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: async () => ({ success: false, data: null, message: 'Проект не найден' }),
                }),
        );
        const client = createApiClient({ baseUrl: BASE_URL, fetch: fakeFetch });

        const promise = client.updateProjectGraphAsync(PROJECT_ID, validGraph);
        await expect(promise).rejects.toMatchObject({
            name: 'ApiClientError',
            status: 404,
        });
    });

    it('выбрасывает ApiClientError при success: false', async () => {
        const fakeFetch = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
                rawResponse({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: async () => ({ success: false, data: null, message: 'Нет доступа' }),
                }),
        );
        const client = createApiClient({ baseUrl: BASE_URL, fetch: fakeFetch });

        await expect(client.getProjectAsync(PROJECT_ID)).rejects.toMatchObject({
            status: 200,
            message: 'Нет доступа',
        });
    });

    it('загружает подложку через FormData без Content-Type', async () => {
        const fakeFetch = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
                okResponse(validUploadDto, 201),
        );
        const client = createApiClient({ baseUrl: BASE_URL, fetch: fakeFetch });
        const file = new File(['тест'], 'plan.png', { type: 'image/png' });

        await expect(client.uploadFloorPlanAsync(PROJECT_ID, file)).resolves.toEqual(validUploadDto);

        const [url, init] = fakeFetch.mock.calls[0] ?? [];
        expect(url).toBe(`${BASE_URL}/projects/${encodeURIComponent(PROJECT_ID)}/floor-plans`);
        expect(init?.method).toBe('POST');
        expect(init?.body).toBeInstanceOf(FormData);
        expect((init?.body as FormData).get('file')).toBe(file);
        expect(init?.headers).toBeUndefined();
    });

    it('вызывает автосборку щита и проверяет канонический ответ', async () => {
        const payload = {
            graph: validGraph,
            explanation: 'Щит НКУ собран',
            toolCalls: [{ tool: 'catalog_lookup', summary: 'Подобраны модули IEK' }],
            panel: {
                groups: [],
                phaseLoads: {
                    L1: { powerW: 0, currentA: 0 },
                    L2: { powerW: 0, currentA: 0 },
                    L3: { powerW: 0, currentA: 0 },
                },
                imbalancePercent: 0,
                modules: [],
                usedDinModules: 0,
                enclosureModules: 24,
                warnings: [],
                references: [],
                rulesVersion: 'PUE-7-2026',
            },
        };
        const fakeFetch = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
                okResponse(payload),
        );
        const client = createApiClient({ baseUrl: BASE_URL, fetch: fakeFetch });

        await expect(client.assemblePanelAsync(PROJECT_ID, 'IEK')).resolves.toEqual(payload);
        const [url, init] = fakeFetch.mock.calls[0] ?? [];
        expect(url).toBe(`${BASE_URL}/projects/${encodeURIComponent(PROJECT_ID)}/ai/assemble-panel`);
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({ preferredBrand: 'IEK' });
    });

    it('вызывает аудит ПУЭ и проверяет канонический отчёт', async () => {
        const payload = {
            projectId: PROJECT_ID,
            findings: [
                {
                    id: 'finding-1',
                    severity: 'warning',
                    ruleId: 'PUE-7.1.3',
                    section: '7.1.3',
                    message: 'Проверить УЗО',
                    nodeIds: [],
                    recommendation: 'Установить УЗО 30 мА',
                },
            ],
            summary: { errors: 0, warnings: 1, info: 0 },
            citations: [
                { ruleId: 'PUE-7.1.3', excerpt: 'УЗО на розеточных группах', document: 'PUE-7' },
            ],
            rulesVersion: 'PUE-7-2026',
            explanation: 'Аудит выполнен',
        };
        const fakeFetch = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
                okResponse(payload),
        );
        const client = createApiClient({ baseUrl: BASE_URL, fetch: fakeFetch });

        await expect(client.auditPueAsync(PROJECT_ID)).resolves.toEqual(payload);
        const [url] = fakeFetch.mock.calls[0] ?? [];
        expect(url).toBe(`${BASE_URL}/projects/${encodeURIComponent(PROJECT_ID)}/ai/audit-pue`);
    });

    it('экспортирует клиент по умолчанию', () => {
        expect(apiClient).toBeDefined();
        expect(typeof apiClient.createProjectAsync).toBe('function');
        expect(typeof apiClient.assemblePanelAsync).toBe('function');
        expect(typeof apiClient.auditPueAsync).toBe('function');
        expect(typeof apiClient.getProjectAsync).toBe('function');
        expect(typeof apiClient.updateProjectGraphAsync).toBe('function');
        expect(typeof apiClient.uploadFloorPlanAsync).toBe('function');
    });
});
