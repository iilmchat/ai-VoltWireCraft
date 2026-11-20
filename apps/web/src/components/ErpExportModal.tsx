// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
/**
 * Диалог интеграций с МойСклад и Битрикс24 (DESIGN v0.8 §3.3).
 *
 * Показывает локальный OFFLINE/DEMO-режим: проверку остатков и две операции
 * записи. Каждая запись проходит HITL-подтверждение: пользователь видит
 * детерминированную фразу, сумму и нажимает «Подтвердить» только осознанно.
 */

import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.js';
import type { BomRow } from '../lib/bomExport.js';
import type { ErpStockItem, ErpWriteResult } from '../lib/erpIntegrations.js';
import {
    buildConfirmationToken,
    checkMoyskladStockAsync,
    createMoyskladOrderAsync,
    sendBitrixEstimateAsync,
} from '../lib/erpIntegrations.js';

/** Ожидающее подтверждения действие пользователя. */
type PendingConfirmation =
    | { readonly kind: 'order'; readonly token: string; readonly amount: number }
    | { readonly kind: 'estimate'; readonly token: string; readonly dealId: string; readonly amount: number };

/** Результат выполненной операции для отображения в диалоге. */
interface OperationStatus {
    /** Признак успеха. */
    readonly ok: boolean;
    /** Идентификатор операции (для успеха). */
    readonly detail: string;
}

/** Свойства блока HITL-подтверждения. */
interface ConfirmationBlockProps {
    /** Подпись операции. */
    readonly title: string;
    /** Фраза подтверждения, вычисленная из спецификации. */
    readonly token: string;
    /** Сумма операции, ₽. */
    readonly amount: number;
    /** Признак выполняющейся операции. */
    readonly busy: boolean;
    /** Обработчик подтверждения. */
    readonly onConfirm: () => void;
    /** Обработчик отмены. */
    readonly onCancel: () => void;
}

/**
 * Форматировать сумму для отображения: две цифры после запятой.
 * @param value Числовое значение, ₽.
 * @returns Строка с десятичной запятой.
 */
function formatMoney(value: number): string {
    return value.toFixed(2).replace('.', ',');
}

/**
 * Блок HITL-подтверждения: подпись, сумма, фраза и кнопки «Да/Нет».
 * @param props Подпись, фраза, сумма и обработчики.
 * @returns React-элемент блока подтверждения.
 */
function ConfirmationBlock({
    title,
    token,
    amount,
    busy,
    onConfirm,
    onCancel,
}: ConfirmationBlockProps) {
    const { t } = useI18n();
    return (
        <div
            role="group"
            aria-label={title}
            className="mt-3 rounded border border-primary bg-primary-container/20 p-3"
        >
            <p className="text-xs font-semibold text-on-surface">
                {title} {formatMoney(amount)} ₽
            </p>
            <p className="mt-1 break-all font-mono text-[10px] text-on-surface-variant">{token}</p>
            <div className="mt-2 flex gap-2">
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={busy}
                    className="rounded bg-primary px-2 py-1 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {t('erp.confirm')}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={busy}
                    className="rounded border border-outline px-2 py-1 text-xs text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {t('erp.cancel')}
                </button>
            </div>
        </div>
    );
}

/**
 * Диалог выгрузки сметы в МойСклад/Битрикс24.
 * @param props Признак открытия, обработчик закрытия, строки спецификации и имя проекта.
 * @returns React-элемент диалога либо `null`, если он закрыт.
 */
export function ErpExportModal({
    open,
    onClose,
    rows,
    projectName,
}: {
    open: boolean;
    onClose: () => void;
    rows: readonly BomRow[];
    projectName: string;
}) {
    const { t } = useI18n();
    const [stock, setStock] = useState<readonly ErpStockItem[] | null>(null);
    const [dealId, setDealId] = useState('');
    const [pending, setPending] = useState<PendingConfirmation | null>(null);
    const [status, setStatus] = useState<OperationStatus | null>(null);
    const [busy, setBusy] = useState(false);

    // Закрытие сбрасывает локальное состояние, чтобы не показывать устаревшие подтверждения.
    useEffect(() => {
        if (!open) {
            setStock(null);
            setDealId('');
            setPending(null);
            setStatus(null);
            setBusy(false);
        }
    }, [open]);

    if (!open) {
        return null;
    }

    const amount = rows.reduce((sum, row) => sum + row.totalRub, 0);
    const canWrite = rows.length > 0 && !busy;

    /**
     * Проверить остатки в демо-складе.
     * @returns Promise, разрешающийся после обновления списка остатков.
     */
    const handleCheckStock = async (): Promise<void> => {
        setBusy(true);
        setStatus(null);
        try {
            setStock(await checkMoyskladStockAsync(rows));
        } catch {
            setStock(null);
            setStatus({ ok: false, detail: '' });
        } finally {
            setBusy(false);
        }
    };

    /** Запросить подтверждение создания заказа МойСклад. */
    const handleOrderRequest = (): void => {
        setStatus(null);
        setPending({
            kind: 'order',
            token: buildConfirmationToken(rows, 'order'),
            amount,
        });
    };

    /** Запросить подтверждение отправки сметы в сделку Битрикс24. */
    const handleEstimateRequest = (): void => {
        setStatus(null);
        const normalizedDealId = dealId.trim();
        if (normalizedDealId.length === 0) {
            setStatus({ ok: false, detail: '' });
            return;
        }
        setPending({
            kind: 'estimate',
            token: buildConfirmationToken(rows, 'estimate', normalizedDealId),
            dealId: normalizedDealId,
            amount,
        });
    };

    /**
     * Выполнить подтверждённую операцию записи.
     * @returns Promise, разрешающийся после получения результата.
     */
    const handleConfirm = async (): Promise<void> => {
        if (pending === null) {
            return;
        }
        const current = pending;
        setBusy(true);
        setStatus(null);
        try {
            const result: ErpWriteResult = current.kind === 'order'
                ? await createMoyskladOrderAsync(rows, current.token)
                : await sendBitrixEstimateAsync(current.dealId, rows, current.token);
            setStatus({ ok: result.ok, detail: result.operationId });
        } catch {
            setStatus({ ok: false, detail: '' });
        } finally {
            setPending(null);
            setBusy(false);
        }
    };

    /** Отменить ожидающее подтверждение. */
    const handleCancel = (): void => {
        setPending(null);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/60 p-4"
            role="presentation"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="erp-title"
                className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-auto rounded-lg border border-outline-variant bg-surface-container-low p-5 text-on-surface shadow-2xl"
            >
                <header className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <h2
                            id="erp-title"
                            className="text-sm font-semibold uppercase tracking-wide text-primary"
                        >
                            {t('erp.title')}
                        </h2>
                        <p className="mt-1 text-xs text-on-surface-variant">{projectName}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        aria-label={t('erp.close')}
                        className="rounded border border-outline px-2 py-1 text-xs text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {t('erp.close')}
                    </button>
                </header>

                <div className="mb-4 space-y-2">
                    <p
                        role="note"
                        className="rounded border border-tertiary bg-tertiary-container px-3 py-2 text-xs text-on-tertiary-container"
                    >
                        {t('erp.offline')}
                    </p>
                    <p
                        role="note"
                        className="rounded border border-secondary bg-secondary-container px-3 py-2 text-xs text-on-secondary-container"
                    >
                        {t('erp.hint')}
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <section
                        aria-labelledby="erp-moysklad"
                        className="rounded-lg border border-outline-variant bg-surface-container p-4"
                    >
                        <h3 id="erp-moysklad" className="mb-3 text-sm font-semibold text-primary">
                            {t('erp.moysklad')}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => { void handleCheckStock(); }}
                                disabled={!canWrite}
                                className="rounded border border-outline bg-surface-container-lowest px-2 py-1 text-xs text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {t('erp.stock.check')}
                            </button>
                            <button
                                type="button"
                                onClick={handleOrderRequest}
                                disabled={!canWrite}
                                className="rounded bg-primary px-2 py-1 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {t('erp.order.create')}
                            </button>
                        </div>

                        {stock !== null && (
                            <div className="mt-3" aria-live="polite">
                                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                                    {t('erp.stock.result')}
                                </h4>
                                <ul className="space-y-1">
                                    {stock.map((item) => (
                                        <li
                                            key={item.article}
                                            className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface-container-low px-2 py-1 text-xs"
                                        >
                                            <span className="min-w-0 truncate text-on-surface" title={item.name}>
                                                {item.name}
                                            </span>
                                            <span className="font-mono text-[10px] text-on-surface-variant">
                                                {item.article}
                                            </span>
                                            <span className="whitespace-nowrap text-on-surface-variant">
                                                {item.available}/{item.required}
                                            </span>
                                            <span
                                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                                    item.available >= item.required
                                                        ? 'bg-primary-container text-on-primary-container'
                                                        : 'bg-error-container text-on-error-container'
                                                }`}
                                            >
                                                {item.available >= item.required
                                                    ? t('erp.inStock')
                                                    : t('erp.lowStock')}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {pending !== null && pending.kind === 'order' && (
                            <ConfirmationBlock
                                title={t('erp.order.confirm')}
                                token={pending.token}
                                amount={pending.amount}
                                busy={busy}
                                onConfirm={() => { void handleConfirm(); }}
                                onCancel={handleCancel}
                            />
                        )}
                    </section>

                    <section
                        aria-labelledby="erp-bitrix"
                        className="rounded-lg border border-outline-variant bg-surface-container p-4"
                    >
                        <h3 id="erp-bitrix" className="mb-3 text-sm font-semibold text-primary">
                            {t('erp.bitrix')}
                        </h3>
                        <label htmlFor="erp-deal-id" className="mb-1 block text-xs font-medium text-on-surface-variant">
                            {t('erp.deal.id')}
                        </label>
                        <input
                            id="erp-deal-id"
                            type="text"
                            value={dealId}
                            onChange={(event) => { setDealId(event.target.value); }}
                            disabled={busy}
                            className="mb-2 w-full rounded border border-outline bg-surface-container-lowest px-2 py-1 text-xs text-on-surface outline-none focus:border-primary disabled:opacity-60"
                        />
                        <button
                            type="button"
                            onClick={handleEstimateRequest}
                            disabled={!canWrite || dealId.trim().length === 0}
                            className="rounded bg-primary px-2 py-1 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {t('erp.sendEstimate')}
                        </button>

                        {pending !== null && pending.kind === 'estimate' && (
                            <ConfirmationBlock
                                title={t('erp.sendEstimate')}
                                token={pending.token}
                                amount={pending.amount}
                                busy={busy}
                                onConfirm={() => { void handleConfirm(); }}
                                onCancel={handleCancel}
                            />
                        )}
                    </section>
                </div>

                {status !== null && (
                    <div
                        role="status"
                        aria-live="polite"
                        className={`mt-4 rounded border px-3 py-2 text-xs ${
                            status.ok
                                ? 'border-primary bg-primary-container text-on-primary-container'
                                : 'border-error bg-error-container text-on-error-container'
                        }`}
                    >
                        <span className="font-semibold">
                            {status.ok ? t('erp.success') : t('erp.failed')}
                        </span>
                        {status.detail.length > 0 && (
                            <code className="ml-2 break-all text-[10px]">{status.detail}</code>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
