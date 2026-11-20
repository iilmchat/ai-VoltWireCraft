// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
/** Модальное окно доступного обновления десктопного приложения. */
import { useState } from 'react';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import type { AvailableUpdate } from '../lib/updater.js';

/**
 * Показать доступное обновление с прогрессом загрузки и кнопками установки.
 * @param props Доступное обновление и обработчик закрытия.
 * @returns React-элемент модального окна или null.
 */
export function UpdateBanner({
    update,
    onDismiss,
}: {
    update: AvailableUpdate | null;
    onDismiss: () => void;
}) {
    const { t } = useI18n();
    const [progress, setProgress] = useState(0);
    const [installing, setInstalling] = useState(false);
    const [failed, setFailed] = useState(false);

    if (update === null) {
        return null;
    }

    /** Скачать, установить и перезапустить приложение. */
    const handleInstall = async (): Promise<void> => {
        setInstalling(true);
        setFailed(false);
        setProgress(0);
        try {
            await update.downloadAndInstallAsync(setProgress);
        } catch {
            setFailed(true);
            setInstalling(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
            <section
                role="dialog"
                aria-modal="true"
                aria-label={t('update.title' as TranslationKey)}
                className="w-full max-w-lg rounded-lg border border-sky-600 bg-slate-900 p-5 shadow-2xl"
            >
                <h2 className="mb-1 text-lg font-semibold text-sky-300">
                    {t('update.title' as TranslationKey)}
                </h2>
                <p className="mb-4 text-xs text-slate-400">
                    {t('update.current')}: {update.currentVersion} → {update.version}
                </p>

                <div className="mb-3 rounded border border-slate-700 bg-slate-800/60 p-3">
                    <p className="mb-1 text-xs font-medium text-slate-300">
                        {t('update.notes')}
                    </p>
                    <p className="whitespace-pre-wrap text-xs text-slate-400">
                        {update.notes.length > 0 ? update.notes : '—'}
                    </p>
                </div>

                {(installing || progress > 0) && (
                    <div className="mb-4" role="status" aria-live="polite">
                        <div className="mb-1 flex justify-between text-xs text-slate-400">
                            <span>{t('update.downloading')}</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded bg-slate-700">
                            <div
                                className="h-full rounded bg-sky-500 transition-all"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}

                {failed && (
                    <p role="alert" className="mb-3 text-xs text-rose-300">
                        {t('update.installFailed')}
                    </p>
                )}

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        disabled={installing}
                        onClick={onDismiss}
                        className="rounded border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                        {t('update.later')}
                    </button>
                    <button
                        type="button"
                        disabled={installing}
                        onClick={() => void handleInstall()}
                        className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                        {installing ? t('update.installing') : t('update.install')}
                    </button>
                </div>
            </section>
        </div>
    );
}
