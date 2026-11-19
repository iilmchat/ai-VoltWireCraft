// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Индикатор расчёта КЗ, потери напряжения и селективности. */
import { useI18n } from '../i18n/index.js';
import { useCalculationStore } from '../store/calculationStore.js';

/** Свойства индикатора. */
export interface ShortCircuitBadgeProps {
    /** Идентификатор линии (для результатов по линии). */
    edgeId?: string;
    /** Компактный режим (для схемы). */
    compact?: boolean;
}

/**
 * Показать расчётные значения КЗ для линии или проекта.
 * @param props Свойства индикатора.
 * @returns React-элемент индикатора.
 */
export function ShortCircuitBadge({ edgeId, compact = false }: ShortCircuitBadgeProps) {
    const { t } = useI18n();
    const result = useCalculationStore((state) => state.shortCircuit);

    if (result === null) {
        return <span className="text-xs text-slate-500">{t('calc.notCalculated')}</span>;
    }

    const line = edgeId === undefined
        ? undefined
        : result.lines.find((item) => item.edgeId === edgeId);
    const current = line?.shortCircuitCurrentA ?? result.serviceCurrentA;
    const drop = line?.voltageDropPercent;
    const limit = line?.voltageDropLimitPercent;
    const ok = line?.selectivityOk ?? result.selectivityOk;

    return (
        <div className={compact ? 'text-[10px] text-slate-300' : 'mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-slate-300'}>
            <div>
                {t('calc.shortCircuit')}: {current.toFixed(1)}
            </div>
            {drop !== undefined && (
                <div>
                    {t('calc.voltageDrop')}: {drop.toFixed(2)} / {limit?.toFixed(1) ?? '—'} %
                </div>
            )}
            <div className="mt-1">
                <span className={`rounded px-2 py-0.5 ${ok ? 'bg-emerald-700 text-emerald-100' : 'bg-rose-700 text-rose-100'}`}>
                    {ok ? t('calc.selectivityOk') : t('calc.selectivityBad')}
                </span>
            </div>
        </div>
    );
}
