// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
/** Тесты детерминированного демо-клиента интеграций (Офлайн/DEMO, без сети). */
import { describe, expect, it } from 'vitest';
import type { BomRow } from './bomExport.js';
import {
    buildConfirmationToken,
    checkMoyskladStockAsync,
    createMoyskladOrderAsync,
    ErpConfirmationError,
    sendBitrixEstimateAsync,
} from './erpIntegrations.js';

/** Кабельная позиция спецификации. */
const cableRow: BomRow = {
    name: 'ВВГнг(А)-LS 3x2.5',
    quantity: 3,
    lengthM: 42.5,
    article: 'ВВГнг(А)-LS 3x2.5',
    priceRub: 70,
    totalRub: 2975,
    sourceId: 'edge-1',
};

/** Позиция защитного аппарата спецификации. */
const deviceRow: BomRow = {
    name: 'Автоматический выключатель C16',
    quantity: 1,
    lengthM: null,
    article: 'IEK C16 1P',
    priceRub: 350,
    totalRub: 350,
    sourceId: 'node-1',
};

/** Фикстура спецификации из двух позиций. */
const rows: readonly BomRow[] = [cableRow, deviceRow];

describe('erpIntegrations', () => {
    describe('checkMoyskladStockAsync', () => {
        it('возвращает детерминированные остатки, отсортированные по имени', async () => {
            const first = await checkMoyskladStockAsync(rows);
            const second = await checkMoyskladStockAsync(rows);

            expect(first).toEqual(second);
            expect(first.map((item) => item.name)).toEqual([
                'Автоматический выключатель C16',
                'ВВГнг(А)-LS 3x2.5',
            ]);
            expect(first.map((item) => item.required)).toEqual([1, 3]);
            for (const item of first) {
                expect(Number.isInteger(item.available)).toBe(true);
                expect(item.available).toBeGreaterThanOrEqual(0);
                expect(item.available).toBeLessThanOrEqual(2 * item.required);
            }
        });

        it('не зависит от порядка входных строк', async () => {
            const reversed = await checkMoyskladStockAsync([...rows].reverse());
            const direct = await checkMoyskladStockAsync(rows);

            expect(reversed).toEqual(direct);
        });

        it('корректно обрабатывает пустую спецификацию', async () => {
            await expect(checkMoyskladStockAsync([])).resolves.toEqual([]);
        });
    });

    describe('buildConfirmationToken', () => {
        it('стабилен и не зависит от порядка строк', () => {
            const token = buildConfirmationToken(rows, 'order');

            expect(token).toBe(buildConfirmationToken(rows, 'order'));
            expect(token).toBe(buildConfirmationToken([...rows].reverse(), 'order'));
            expect(token).toMatch(/^VWC-ERP-ORDER-/);
        });

        it('различает операции и сделки', () => {
            const orderToken = buildConfirmationToken(rows, 'order');
            const estimateToken = buildConfirmationToken(rows, 'estimate', 'deal-1');

            expect(orderToken).not.toBe(estimateToken);
            expect(estimateToken).toBe(buildConfirmationToken(rows, 'estimate', 'deal-1'));
            expect(estimateToken).not.toBe(buildConfirmationToken(rows, 'estimate', 'deal-2'));
        });
    });

    describe('createMoyskladOrderAsync', () => {
        it('отвергает неверный и пустой токен подтверждения', async () => {
            await expect(createMoyskladOrderAsync(rows, 'wrong-token'))
                .rejects.toBeInstanceOf(ErpConfirmationError);
            await expect(createMoyskladOrderAsync(rows, ''))
                .rejects.toBeInstanceOf(ErpConfirmationError);
        });

        it('создаёт заказ с верным токеном и возвращает стабильный идентификатор', async () => {
            const token = buildConfirmationToken(rows, 'order');

            const first = await createMoyskladOrderAsync(rows, token);
            const second = await createMoyskladOrderAsync(rows, token);

            expect(first.ok).toBe(true);
            expect(first.operationId).toMatch(/^ms-order-/);
            expect(first).toEqual(second);
        });
    });

    describe('sendBitrixEstimateAsync', () => {
        it('отвергает пустой ID сделки', async () => {
            await expect(sendBitrixEstimateAsync('', rows, 'any'))
                .rejects.toThrow(/ID сделки/);
            await expect(sendBitrixEstimateAsync('   ', rows, 'any'))
                .rejects.toThrow(/ID сделки/);
        });

        it('отвергает неверный токен подтверждения', async () => {
            await expect(sendBitrixEstimateAsync('deal-1', rows, 'wrong-token'))
                .rejects.toBeInstanceOf(ErpConfirmationError);
        });

        it('отправляет смету с верным токеном и возвращает стабильный идентификатор', async () => {
            const token = buildConfirmationToken(rows, 'estimate', 'deal-1');

            const first = await sendBitrixEstimateAsync('deal-1', rows, token);
            const second = await sendBitrixEstimateAsync('deal-1', rows, token);

            expect(first.ok).toBe(true);
            expect(first.operationId).toMatch(/^bx-estimate-/);
            expect(first).toEqual(second);
        });
    });
});
