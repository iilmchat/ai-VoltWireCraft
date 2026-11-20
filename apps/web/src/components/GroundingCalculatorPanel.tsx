// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Инструмент расчёта контура заземления и стержневой молниезащиты. */
import { useState } from 'react';
import { UuidSchema } from '@voltwirecraft/shared/graph.schema.js';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { apiClient } from '../lib/apiClient.js';
import { calculateGrounding } from '../lib/grounding.js';
import type { GroundingInput, GroundingResult, SoilKind } from '../lib/grounding.js';
import { useEditorStore } from '../store/editorStore.js';

/** Локализованные ключи типов грунта. */
const SOILS: readonly SoilKind[] = ['sand', 'loam', 'clay'];

/**
 * Панель расчёта заземления и молниезащиты.
 * @returns React-элемент вкладки.
 */
export function GroundingCalculatorPanel() {
    const { t } = useI18n();
    const serverProjectId = useEditorStore((state) => state.serverProjectId);
    const [soil, setSoil] = useState<SoilKind>('loam');
    const [electrodeLength, setElectrodeLength] = useState(3);
    const [electrodeCount, setElectrodeCount] = useState(3);
    const [stripLength, setStripLength] = useState(10);
    const [mastHeight, setMastHeight] = useState(10);
    const [result, setResult] = useState<GroundingResult | null>(null);
    const [busy, setBusy] = useState(false);
    const [offline, setOffline] = useState(false);

    /** Выполнить расчёт: сервер или локальный предпросмотр. */
    const handleCalculate = async (): Promise<void> => {
        const request: GroundingInput = {
            soil,
            electrodeLengthM: electrodeLength,
            electrodeCount,
            stripLengthM: stripLength,
            mastHeightM: mastHeight,
        };
        const local = calculateGrounding(request);
        setBusy(true);
        setOffline(false);
        const parsedId = UuidSchema.safeParse(serverProjectId ?? '');
        try {
            if (!parsedId.success) {
                throw new Error('offline');
            }
            setResult(await apiClient.calculateGroundingAsync(parsedId.data, request));
        } catch {
            setResult(local);
            setOffline(true);
        } finally {
            setBusy(false);
        }
    };

    /** Числовое поле формы. */
    const numberField = (
        labelKey: TranslationKey,
        value: number,
        onChange: (value: number) => void,
    ) => (
        <label className="mb-3 block">
            <span className="mb-1 block text-xs text-slate-400">{t(labelKey)}</span>
            <input
                type="number"
                min="0.1"
                step="0.5"
                value={value}
                onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next) && next > 0) {
                        onChange(next);
                    }
                }}
                className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
            />
        </label>
    );

    return (
        <section className="h-full overflow-y-auto bg-slate-950 p-4 text-slate-100">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-300">
                {t('grounding.title')}
            </h2>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <div className="rounded border border-slate-700 bg-slate-900 p-4">
                    <label className="mb-3 block">
                        <span className="mb-1 block text-xs text-slate-400">{t('grounding.soil')}</span>
                        <select value={soil} onChange={(event) => setSoil(event.target.value as SoilKind)}
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm">
                            {SOILS.map((kind) => (
                                <option key={kind} value={kind}>
                                    {t(`grounding.soil.${kind}` as TranslationKey)}
                                </option>
                            ))}
                        </select>
                    </label>
                    {numberField('grounding.electrodeLength', electrodeLength, setElectrodeLength)}
                    {numberField('grounding.electrodeCount', electrodeCount, setElectrodeCount)}
                    {numberField('grounding.stripLength', stripLength, setStripLength)}
                    {numberField('grounding.mastHeight', mastHeight, setMastHeight)}
                    <button type="button" disabled={busy} onClick={() => void handleCalculate()}
                        className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
                        {busy ? t('grounding.calculating') : t('grounding.calculate')}
                    </button>
                    {offline && <p className="mt-2 text-xs text-amber-300">{t('grounding.offline')}</p>}
                    {result !== null && (
                        <div className="mt-3 space-y-1 rounded border border-slate-700 bg-slate-800/50 p-3 text-xs">
                            <p className="font-semibold text-slate-200">{t('grounding.result')}</p>
                            <p>{t('grounding.resistance')}: {result.resistanceOhm.toFixed(2)}</p>
                            <p>{t('grounding.norm')}</p>
                            <p>{t('grounding.zoneRadius')}: {result.zoneRadiusM.toFixed(2)}</p>
                            <p className={result.ok ? 'text-emerald-300' : 'text-rose-300'}>
                                {t(result.ok ? 'grounding.ok' : 'grounding.bad')}
                            </p>
                        </div>
                    )}
                </div>

                <div className="rounded border border-slate-700 bg-slate-900 p-4">
                    <svg viewBox="0 0 400 300" className="w-full" role="img" aria-label={t('grounding.title')}>
                        <g stroke="currentColor" fill="none" strokeWidth="2" className="text-slate-400">
                            <line x1="40" y1="210" x2="360" y2="210" />
                            {[80, 160, 240, 320].map((x) => (
                                <line key={x} x1={x} y1="210" x2={x} y2="260" />
                            ))}
                            <line x1="200" y1="210" x2="200" y2="70" />
                        </g>
                        <g fill="currentColor" className="text-sky-300">
                            <circle cx="200" cy="210" r="4" />
                            <circle cx="200" cy="70" r="5" />
                        </g>
                        {result !== null && (
                            <circle cx="200" cy="210" r={Math.min(150, result.zoneRadiusM * 8)}
                                fill="currentColor" fillOpacity="0.15" stroke="currentColor"
                                strokeDasharray="6 4" className="text-emerald-400" />
                        )}
                        <text x="205" y="65" fill="currentColor" className="text-xs text-slate-300">
                            {mastHeight} м
                        </text>
                    </svg>
                </div>
            </div>
        </section>
    );
}
