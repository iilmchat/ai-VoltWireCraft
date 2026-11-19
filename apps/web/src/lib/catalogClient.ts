// © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
/**
 * Типизированный клиент публичного каталога оборудования (KI-004).
 *
 * Сервер возвращает список позиций в единой обёртке `{ success, data, message }`.
 * Цена `priceRub` приходит строкой `numeric` (`'350.00'`) и приводится к числу
 * на границе клиента, чтобы спецификация сразу работала с числовыми деньгами.
 * Локальные копии перечислений повторяют `apps/api/src/database/schema.ts`,
 * чтобы не добавлять зависимость веб-пакета от серверного кода.
 */

import { z } from 'zod';

/** Бренды модульного оборудования (зеркало `DEVICE_BRANDS` сервера). */
const DEVICE_BRANDS = ['IEK', 'EKF', 'КЭАЗ', 'ABB', 'Schneider Electric', 'Legrand'] as const;

/** Типы устройств каталога (зеркало `CATALOG_DEVICE_TYPES` сервера). */
const CATALOG_DEVICE_TYPES = [
    'circuit_breaker',
    'rcd',
    'rcbo',
    'relay_voltage',
    'contactor',
    'panel',
] as const;

/** Число полюсов (зеркало `DEVICE_POLES` сервера). */
const DEVICE_POLES = ['1P', '2P', '3P', '4P'] as const;

/** Типы расцепителя (зеркало `TRIP_CURVES` сервера). */
const TRIP_CURVES = ['B', 'C', 'D'] as const;

/**
 * Строковое поле `numeric` сервера → конечное неотрицательное число рублей.
 * Некорректные значения отвергаются Zod, а не превращаются в `NaN`.
 */
const PriceRubSchema = z
    .string()
    .transform((raw) => Number(raw))
    .pipe(z.number().finite().nonnegative());

/** Позиция каталога: поля совпадают с `CatalogDeviceDto` сервера. */
export const CatalogDeviceSchema = z.object({
    /** Идентификатор позиции (UUID). */
    id: z.uuid(),
    /** Производитель. */
    brand: z.enum(DEVICE_BRANDS),
    /** Серия устройства. */
    series: z.string(),
    /** Артикул производителя. */
    sku: z.string(),
    /** Наименование позиции. */
    name: z.string(),
    /** Тип устройства. */
    deviceType: z.enum(CATALOG_DEVICE_TYPES),
    /** Число полюсов; `null`, если неприменимо. */
    poles: z.enum(DEVICE_POLES).nullable(),
    /** Номинальный ток, А; `null`, если неприменимо. */
    ratedCurrentA: z.number().int().nullable(),
    /** Тип расцепителя; `null`, если неприменимо. */
    tripCurve: z.enum(TRIP_CURVES).nullable(),
    /** Уставка тока утечки, мА; `null`, если неприменимо. */
    leakageCurrentMa: z.number().int().nullable(),
    /** Коммутационная способность, кА (строка `numeric`). */
    breakingCapacityKa: z.string().nullable(),
    /** Ширина в 18-мм модулях; `null` для корпусов. */
    widthModules: z.number().int().nullable(),
    /** Цена, ₽ (число после преобразования строки сервера). */
    priceRub: PriceRubSchema,
    /** Дополнительные характеристики. */
    specsJson: z.record(z.string(), z.unknown()),
});

/** Постраничный список каталога. */
export const CatalogListSchema = z.object({
    /** Позиции текущей страницы. */
    items: z.array(CatalogDeviceSchema),
    /** Общее число позиций по фильтру. */
    total: z.number().int().nonnegative(),
    /** Номер текущей страницы. */
    page: z.number().int().positive(),
    /** Размер страницы. */
    pageSize: z.number().int().positive(),
});

/** Тип позиции каталога (цена уже числовая). */
export type CatalogDevice = z.infer<typeof CatalogDeviceSchema>;

/** Тип постраничного списка каталога. */
export type CatalogList = z.infer<typeof CatalogListSchema>;

/** Обёртка ответа API (аналог `ApiResponse` сервера). */
const ApiEnvelopeSchema = z.object({
    /** Признак успешности. */
    success: z.boolean(),
    /** Полезная нагрузка; проверяется отдельной схемой. */
    data: z.unknown(),
    /** Человекочитаемое сообщение. */
    message: z.string(),
});

/** Базовый URL API по умолчанию. */
const DEFAULT_BASE_URL = 'http://localhost:3000';

/** Размер страницы каталога по умолчанию: весь справочник одним запросом. */
const DEFAULT_PAGE_SIZE = 100;

/** Параметры запроса списка каталога. */
export interface ListCatalogOptions {
    /** Сигнал отмены запроса (например, при размонтировании компонента). */
    readonly signal?: AbortSignal;
    /** Размер страницы; ограничен сервером значением 100. */
    readonly pageSize?: number;
}

/**
 * Получить базовый URL API из переменных окружения Vite.
 * @returns Значение `VITE_API_URL` или URL по умолчанию.
 */
function resolveBaseUrl(): string {
    const env = import.meta.env as unknown as Record<string, unknown> | undefined;
    const value = env?.VITE_API_URL;
    return typeof value === 'string' && value.length > 0 ? value : DEFAULT_BASE_URL;
}

/**
 * Запросить `GET /catalog/devices` и разобрать ответ.
 *
 * @param options Сигнал отмены и размер страницы (по умолчанию 100, страница 1).
 * @returns Провалидированный список каталога с числовыми ценами.
 * @throws {Error} При ошибке HTTP, некорректной обёртке или некорректных данных.
 */
export async function listCatalogAsync(options: ListCatalogOptions = {}): Promise<CatalogList> {
    const requested = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const pageSize = Number.isFinite(requested)
        ? Math.min(100, Math.max(1, Math.floor(requested)))
        : DEFAULT_PAGE_SIZE;
    const url = `${resolveBaseUrl()}/catalog/devices?page=1&pageSize=${pageSize}`;

    const response = await fetch(url, {
        method: 'GET',
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    if (!response.ok) {
        const statusText = response.statusText.trim();
        throw new Error(
            `Не удалось получить каталог оборудования: ${response.status}${statusText === '' ? '' : ` ${statusText}`}`,
        );
    }

    let raw: unknown;
    try {
        raw = await response.json();
    } catch {
        throw new Error('Не удалось прочитать JSON ответа каталога');
    }

    let envelope: z.infer<typeof ApiEnvelopeSchema>;
    try {
        envelope = ApiEnvelopeSchema.parse(raw);
    } catch {
        throw new Error('Некорректная обёртка ответа каталога');
    }

    if (!envelope.success) {
        throw new Error(envelope.message.length > 0 ? envelope.message : 'Ошибка получения каталога');
    }

    try {
        return CatalogListSchema.parse(envelope.data);
    } catch {
        throw new Error('Некорректные данные каталога');
    }
}
