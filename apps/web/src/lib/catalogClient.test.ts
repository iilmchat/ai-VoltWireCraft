// © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
/** Тесты клиента каталога (KI-004): разбор ответа, ошибки и параметры запроса. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listCatalogAsync } from './catalogClient.js';

const BASE_URL = 'http://catalog.test';
const DEVICE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** Каноническая позиция каталога: цена приходит строкой `numeric`. */
const catalogDevice = {
    id: DEVICE_ID,
    brand: 'IEK',
    series: 'ИЭК',
    sku: 'IEK-C16-1P',
    name: 'Автоматический выключатель C16 1P',
    deviceType: 'circuit_breaker',
    poles: '1P',
    ratedCurrentA: 16,
    tripCurve: 'C',
    leakageCurrentMa: null,
    breakingCapacityKa: '4.5',
    widthModules: 1,
    priceRub: '350.00',
    specsJson: {},
};

/** Успешная обёртка ответа API с заданными данными. */
function okEnvelope(data: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        json: async () => ({ success: true, data, message: 'Каталог получен' }),
    } as unknown as Response;
}

/** Подменить глобальный `fetch` заданной функцией. */
function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
    vi.stubGlobal('fetch', vi.fn(handler));
}

describe('listCatalogAsync', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_API_URL', BASE_URL);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('разбирает ответ и превращает строковую цену в число', async () => {
        const list = {
            items: [catalogDevice],
            total: 1,
            page: 1,
            pageSize: 100,
        };
        stubFetch(async () => okEnvelope(list));

        const result = await listCatalogAsync();

        expect(result.total).toBe(1);
        expect(result.items).toHaveLength(1);
        const item = result.items[0];
        expect(item).toBeDefined();
        expect(item?.priceRub).toBe(350);
        expect(typeof item?.priceRub).toBe('number');
        expect(item?.sku).toBe('IEK-C16-1P');
        expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            `${BASE_URL}/catalog/devices?page=1&pageSize=100`,
            { method: 'GET' },
        );
    });

    it('отвергает некорректную обёртку ответа', async () => {
        stubFetch(async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ success: true, data: {} }),
        }) as unknown as Response);

        await expect(listCatalogAsync()).rejects.toThrow(/Некорректная обёртка ответа каталога/);
    });

    it('передаёт pageSize в строке запроса', async () => {
        const list = { items: [], total: 0, page: 1, pageSize: 25 };
        stubFetch(async () => okEnvelope(list));

        await listCatalogAsync({ pageSize: 25 });

        expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            `${BASE_URL}/catalog/devices?page=1&pageSize=25`,
            { method: 'GET' },
        );
    });

    it('передаёт сигнал отмены в fetch', async () => {
        const list = { items: [], total: 0, page: 1, pageSize: 100 };
        stubFetch(async () => okEnvelope(list));
        const controller = new AbortController();

        await listCatalogAsync({ signal: controller.signal });

        expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            `${BASE_URL}/catalog/devices?page=1&pageSize=100`,
            { method: 'GET', signal: controller.signal },
        );
    });

    it('выбрасывает русскоязычную ошибку на не-2xx ответе', async () => {
        stubFetch(async () => okEnvelope(null, 503));

        await expect(listCatalogAsync()).rejects.toThrow(/Не удалось получить каталог оборудования: 503/);
    });

    it('отвергает некорректные данные каталога', async () => {
        const broken = {
            ...catalogDevice,
            priceRub: 'не число',
        };
        stubFetch(async () => okEnvelope({
            items: [broken],
            total: 1,
            page: 1,
            pageSize: 100,
        }));

        await expect(listCatalogAsync()).rejects.toThrow(/Некорректные данные каталога/);
    });
});
