// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/index.js';
import { effectiveScale } from '../../lib/geometry.js';
import { useEditorStore } from '../../store/editorStore.js';

/**
 * Панель калибровки масштаба: появляется после рисования отрезка.
 * @returns React-элемент панели или null.
 */
export function ScaleCalibratorTool() {
    const { t } = useI18n();
    const scaleDraft = useEditorStore((state) => state.scaleDraft);
    const scaleMetersPerPx = useEditorStore((state) => state.graph.floorPlan.scaleMetersPerPx);
    const [lengthInput, setLengthInput] = useState('900');
    const [invalid, setInvalid] = useState(false);

    useEffect(() => {
        if (scaleDraft !== null) {
            setInvalid(false);
        }
    }, [scaleDraft]);

    if (scaleDraft === null) {
        return null;
    }

    const lengthPx = Math.hypot(scaleDraft.end.x - scaleDraft.start.x, scaleDraft.end.y - scaleDraft.start.y);
    const previewMm = lengthPx * effectiveScale(scaleMetersPerPx) * 1000;

    const apply = (): void => {
        const value = Number(lengthInput);
        if (!Number.isFinite(value) || value <= 0) {
            setInvalid(true);
            return;
        }
        const saved = useEditorStore.getState().calibrateScale(lengthPx, value);
        setInvalid(!saved);
    };

    return (
        <div className="absolute left-4 top-4 w-72 rounded-lg border border-amber-500/60 bg-slate-900/95 p-4 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold text-amber-300">{t('scale.title')}</h3>
            <p className="mb-3 text-xs text-slate-400">
                {lengthPx.toFixed(1)} {t('common.px')} · ~{previewMm.toFixed(0)} {t('common.mm')}
            </p>
            <label className="mb-1 block text-xs text-slate-300" htmlFor="scale-length">
                {t('scale.lengthLabel')}
            </label>
            <input
                id="scale-length"
                type="number"
                min="1"
                step="any"
                value={lengthInput}
                onChange={(event) => {
                    setLengthInput(event.target.value);
                    setInvalid(false);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        apply();
                    }
                }}
                className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100"
            />
            {invalid && <p className="mt-1 text-xs text-rose-400">{t('scale.invalid')}</p>}
            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    onClick={apply}
                    className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-slate-900 hover:bg-amber-400"
                >
                    {t('scale.apply')}
                </button>
                <button
                    type="button"
                    onClick={() => useEditorStore.getState().setScaleDraft(null)}
                    className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                    {t('scale.cancel')}
                </button>
            </div>
        </div>
    );
}
