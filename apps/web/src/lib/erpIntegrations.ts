// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
/**
 * Локальный демо-клиент интеграций с МойСклад и Битрикс24 (DESIGN v0.8 §2.1, §3.1).
 *
 * Реальные MCP-серверы реализуются отдельной командой и могут отсутствовать,
 * поэтому здесь работает детерминированный слой OFFLINE/DEMO: без сети, без
 * токенов во фронтенде и без случайных величин. Все операции записи требуют
 * явного `confirmationToken`, который UI получает от пользователя через HITL.
 * Транспорт изолирован в `demoErpTransport` и может быть заменён реальным
 * API-клиентом с тем же контрактом без изменения публичных функций.
 */

import type { BomRow } from './bomExport.js';

/** Позиция остатка товара в демо-складе. */
export interface ErpStockItem {
    /** Наименование позиции спецификации. */
    name: string;
    /** Артикул позиции. */
    article: string;
    /** Доступное количество, шт. */
    available: number;
    /** Требуемое количество из спецификации, шт. */
    required: number;
}

/** Результат демо-операции записи во внешнюю систему. */
export interface ErpWriteResult {
    /** Признак успешного выполнения операции. */
    ok: boolean;
    /** Стабильный идентификатор операции. */
    operationId: string;
    /** Человекочитаемое сообщение. */
    message: string;
}

/** Вид операции записи, требующей подтверждения. */
type ErpOperation = 'order' | 'estimate';

/** Ошибка отсутствующего или неверного токена подтверждения. */
export class ErpConfirmationError extends Error {
    /**
     * @param message — описание ошибки подтверждения.
     */
    constructor(message: string) {
        super(message);
        this.name = 'ErpConfirmationError';
    }
}

/**
 * Вычислить 32-битный хэш строки по алгоритму FNV-1a.
 * @param value Исходная строка.
 * @returns Беззнаковое 32-битное число.
 */
function hashNumber(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * Представить хэш в виде восьми шестнадцатеричных цифр.
 * @param value Исходная строка.
 * @returns Стабильная строка хэша.
 */
function hashHex(value: string): string {
    return hashNumber(value).toString(16).padStart(8, '0');
}

/**
 * Построить каноническое представление строк спецификации, не зависящее
 * от порядка строк: поля фиксированы, строки отсортированы по коду символов.
 * @param rows Строки спецификации.
 * @returns JSON-массив канонических ключей.
 */
function canonicalRowsPayload(rows: readonly BomRow[]): string {
    const keys = rows.map((row) => JSON.stringify([
        row.name,
        row.article,
        row.quantity,
        row.lengthM,
        row.priceRub,
        row.totalRub,
        row.sourceId ?? null,
    ]));
    keys.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    return JSON.stringify(keys);
}

/**
 * Построить детерминированную фразу подтверждения операции.
 * @param rows Строки спецификации.
 * @param operation Вид операции (`order` или `estimate`).
 * @param dealId Идентификатор сделки Битрикс24 (только для `estimate`).
 * @returns Стабильная строка, показываемая пользователю и сравниваемая при записи.
 */
export function buildConfirmationToken(
    rows: readonly BomRow[],
    operation: ErpOperation,
    dealId?: string,
): string {
    const rowsHash = hashHex(canonicalRowsPayload(rows));
    const dealPart = dealId === undefined ? 'NONE' : hashHex(dealId);
    return `VWC-ERP-${operation.toUpperCase()}-${dealPart}-${rowsHash}`;
}

/**
 * Проверить, что токен подтверждения получен и совпадает с ожидаемым.
 * @param token Токен из UI.
 * @param expected Ожидаемый токен.
 * @throws {ErpConfirmationError} Если токен пуст или не совпадает.
 */
function requireConfirmation(token: string, expected: string): void {
    if (token.trim().length === 0 || token !== expected) {
        throw new ErpConfirmationError('Неверный или пустой токен подтверждения операции');
    }
}

/**
 * Демонстрационный транспорт: детерминированные чтение и запись без сети.
 * Контракт совпадает с будущим реальным MCP/API-клиентом.
 */
const demoErpTransport = {
    /**
     * Получить остатки по позициям спецификации.
     * @param rows Строки спецификации.
     * @returns Остатки, отсортированные по наименованию.
     */
    async checkStock(rows: readonly BomRow[]): Promise<readonly ErpStockItem[]> {
        const items = rows.map((row) => {
            const span = 2 * Math.max(0, row.quantity);
            const available = hashNumber(row.article) % (span + 1);
            return {
                name: row.name,
                article: row.article,
                available,
                required: row.quantity,
            };
        });
        items.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        return items;
    },

    /**
     * Выполнить демо-запись и вернуть стабильный результат.
     * @param operationId Идентификатор операции, выведенный из токена.
     * @param operation Вид операции для сообщения.
     * @returns Результат операции.
     */
    async write(operationId: string, operation: ErpOperation): Promise<ErpWriteResult> {
        return {
            ok: true,
            operationId,
            message: `Демо-операция ${operation} ${operationId} выполнена`,
        };
    },
};

/**
 * Проверить остатки МойСклад в демо-режиме.
 * @param rows Строки спецификации.
 * @returns Массив остатков, отсортированный по наименованию.
 */
export async function checkMoyskladStockAsync(
    rows: readonly BomRow[],
): Promise<readonly ErpStockItem[]> {
    return demoErpTransport.checkStock(rows);
}

/**
 * Создать заказ в МойСклад в демо-режиме.
 * @param rows Строки спецификации.
 * @param confirmationToken Фраза подтверждения из UI.
 * @returns Результат операции со стабильным идентификатором.
 * @throws {ErpConfirmationError} Если подтверждение отсутствует или неверно.
 */
export async function createMoyskladOrderAsync(
    rows: readonly BomRow[],
    confirmationToken: string,
): Promise<ErpWriteResult> {
    const expected = buildConfirmationToken(rows, 'order');
    requireConfirmation(confirmationToken, expected);
    const operationId = `ms-order-${hashHex(expected)}`;
    return demoErpTransport.write(operationId, 'order');
}

/**
 * Отправить смету в сделку Битрикс24 в демо-режиме.
 * @param dealId Идентификатор сделки Битрикс24.
 * @param rows Строки спецификации.
 * @param confirmationToken Фраза подтверждения из UI.
 * @returns Результат операции со стабильным идентификатором.
 * @throws {ErpConfirmationError} Если сделка не указана или подтверждение неверно.
 */
export async function sendBitrixEstimateAsync(
    dealId: string,
    rows: readonly BomRow[],
    confirmationToken: string,
): Promise<ErpWriteResult> {
    if (dealId.trim().length === 0) {
        throw new ErpConfirmationError('Не указан ID сделки Битрикс24');
    }
    const expected = buildConfirmationToken(rows, 'estimate', dealId);
    requireConfirmation(confirmationToken, expected);
    const operationId = `bx-estimate-${hashHex(expected)}`;
    return demoErpTransport.write(operationId, 'estimate');
}
