// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Индикатор канонического расчёта КЗ и селективности. */
import { useI18n } from '../i18n/index.js';
import { useCalculationStore } from '../store/calculationStore.js';

/** Свойства индикатора. */
export interface ShortCircuitBadgeProps {
    /** Компактный режим (для схемы). */
    compact?: boolean;
}

/**
 * Показать расчётные значения КЗ из канонического ответа.
 * @param props Свойства индикатора.
 * @returns React-элемент индикатора.
 */
export function ShortCircuitBadge({ compact = false }: ShortCircuitBadgeProps) {
    const { t } = useI18n();
    const result = useCalculationStore((state) => state.shortCircuit);

    if (result === null) {
        return <span className="text-xs text-slate-500">{t('calc.notCalculated')}</span>;
    }

    const ok = result.selectivityOk && result.disconnectComplies;

    return (
        <div className={compact ? 'text-[10px] text-slate-300' : 'mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-slate-300'}>
            <div>
                {t('calc.shortCircuit')}: {result.shortCircuitCurrentA.toFixed(1)}
            </div>
            <div>
                {t('calc.multiplicity')}: {result.actualMultiplicity.toFixed(1)} / {result.minimumMultiplicity.toFixed(1)}
            </div>
            <div>{t('calc.tripTime')}: {result.tripTimeS.toFixed(3)} с</div>
            <div className="mt-1">
                <span className={`rounded px-2 py-0.5 ${ok ? 'bg-emerald-700 text-emerald-100' : 'bg-rose-700 text-rose-100'}`}>
                    {ok ? t('calc.selectivityOk') : t('calc.selectivityBad')}
                </span>
            </div>
        </div>
    );
}
