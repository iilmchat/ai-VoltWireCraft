// © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
/**
 * Панель выпуска документации РД по ГОСТ Р 21.101 (RULES § 5.4 — офлайн).
 * Реквизиты штампа вводятся локально и не записываются в канонический граф:
 * в документ попадают только значения, использованные при формировании PDF.
 */
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { exportGostPdfAsync } from '../lib/gostPdfExport.js';
import { useEditorStore } from '../store/editorStore.js';

/** Ключи локализованных названий листов комплекта. */
const SHEET_KEYS: readonly TranslationKey[] = [
    'gost.sheet1' as TranslationKey,
    'gost.sheet2' as TranslationKey,
    'gost.sheet3' as TranslationKey,
    'gost.sheet4' as TranslationKey,
];

/** Состояние формирования документа. */
type ExportStatus = 'idle' | 'working' | 'done' | 'error';

/** Свойства поля ввода реквизита штампа. */
interface StampFieldProps {
    /** Идентификатор поля (для связи с подписью). */
    id: string;
    /** Подпись поля. */
    label: string;
    /** Текущее значение. */
    value: string;
    /** Обработчик изменения значения. */
    onChange: (value: string) => void;
    /** Блокировка во время формирования документа. */
    disabled: boolean;
}

/**
 * Поле ввода одного реквизита основной надписи.
 * @param props Идентификатор, подпись, значение и обработчик.
 * @returns React-элемент поля формы.
 */
function StampField({ id, label, value, onChange, disabled }: StampFieldProps) {
    return (
        <div>
            <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-300">
                {label}
            </label>
            <input
                id={id}
                type="text"
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
        </div>
    );
}

/**
 * Панель выпуска комплекта РД (четыре листа A4 по ГОСТ Р 21.101).
 * @param props Признак открытости и обработчик закрытия.
 * @returns React-элемент модальной панели или null.
 */
export function GostDocsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useI18n();
    const graph = useEditorStore((state) => state.graph);
    const stamp = graph.stampMeta;

    const [projectCode, setProjectCode] = useState(stamp?.projectCode ?? '');
    const [designerName, setDesignerName] = useState(stamp?.designerName ?? '');
    const [reviewerName, setReviewerName] = useState(stamp?.reviewerName ?? '');
    const [organizationName, setOrganizationName] = useState(stamp?.organizationName ?? '');
    const [stage, setStage] = useState(stamp?.stage ?? '');
    const [status, setStatus] = useState<ExportStatus>('idle');

    // При каждом открытии панели реквизиты заново берутся из графа;
    // введённые пользователем значения остаются локальными.
    useEffect(() => {
        if (open) {
            setProjectCode(stamp?.projectCode ?? '');
            setDesignerName(stamp?.designerName ?? '');
            setReviewerName(stamp?.reviewerName ?? '');
            setOrganizationName(stamp?.organizationName ?? '');
            setStage(stamp?.stage ?? '');
            setStatus('idle');
        }
    }, [open]);

    if (!open) {
        return null;
    }

    const working = status === 'working';

    /** Сформировать PDF и сообщить результат. */
    const handleExport = async (): Promise<void> => {
        setStatus('working');
        try {
            await exportGostPdfAsync(graph, {
                projectCode: projectCode.trim(),
                designerName: designerName.trim(),
                reviewerName: reviewerName.trim(),
                organizationName: organizationName.trim(),
                stage: stage.trim() || undefined,
            });
            setStatus('done');
        } catch {
            setStatus('error');
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
            role="presentation"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="gost-title"
                className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            >
                <header className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <h2
                            id="gost-title"
                            className="text-sm font-semibold uppercase tracking-wide text-sky-300"
                        >
                            {t('gost.title' as TranslationKey)}
                        </h2>
                        <p className="mt-1 text-xs text-slate-400">
                            {t('gost.formTitle' as TranslationKey)}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('gost.close' as TranslationKey)}
                        className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-800"
                    >
                        {t('gost.close' as TranslationKey)}
                    </button>
                </header>

                <div className="space-y-3">
                    <StampField
                        id="gost-code"
                        label={t('gost.code' as TranslationKey)}
                        value={projectCode}
                        onChange={setProjectCode}
                        disabled={working}
                    />
                    <StampField
                        id="gost-designer"
                        label={t('gost.designer' as TranslationKey)}
                        value={designerName}
                        onChange={setDesignerName}
                        disabled={working}
                    />
                    <StampField
                        id="gost-reviewer"
                        label={t('gost.reviewer' as TranslationKey)}
                        value={reviewerName}
                        onChange={setReviewerName}
                        disabled={working}
                    />
                    <StampField
                        id="gost-organization"
                        label={t('gost.organization' as TranslationKey)}
                        value={organizationName}
                        onChange={setOrganizationName}
                        disabled={working}
                    />
                    <StampField
                        id="gost-stage"
                        label={t('gost.stage' as TranslationKey)}
                        value={stage}
                        onChange={setStage}
                        disabled={working}
                    />
                </div>

                <ol className="mt-4 list-decimal space-y-1 rounded border border-slate-700 bg-slate-800/50 py-2 pl-8 pr-3 text-xs text-slate-300">
                    {SHEET_KEYS.map((key) => (
                        <li key={key}>{t(key)}</li>
                    ))}
                </ol>

                <p className="mt-3 text-xs text-slate-500">{t('gost.hint' as TranslationKey)}</p>

                {status !== 'idle' && (
                    <p
                        role="status"
                        className={`mt-3 text-xs ${
                            status === 'error' ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                    >
                        {status === 'done'
                            ? t('gost.done' as TranslationKey)
                            : status === 'error'
                                ? t('gost.failed' as TranslationKey)
                                : t('gost.exporting' as TranslationKey)}
                    </p>
                )}

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-700"
                    >
                        {t('gost.close' as TranslationKey)}
                    </button>
                    <button
                        type="button"
                        disabled={working}
                        onClick={() => void handleExport()}
                        className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {working
                            ? t('gost.exporting' as TranslationKey)
                            : t('gost.button' as TranslationKey)}
                    </button>
                </div>
            </div>
        </div>
    );
}
