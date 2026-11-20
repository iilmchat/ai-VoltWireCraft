// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
/**
 * Диалог время-токовых характеристик (ВТХ) и селективности аппаратов защиты.
 *
 * Основной источник чисел — серверный API (`apiClient.selectivityTccAsync`,
 * RULES § 5.1). При отсутствии серверного проекта или ошибке запроса
 * используется честно помеченный детерминированный локальный предпросмотр.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, TouchEvent } from 'react';
import { UuidSchema } from '@voltwirecraft/shared/graph.schema.js';
import type { TccSelectivityRequest, TccSelectivityResponse } from '@voltwirecraft/shared/graph.schema.js';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { apiClient } from '../lib/apiClient.js';
import { buildTccRequest, computeTccPreview, tccCurvePoints, tripTime } from '../lib/tcc.js';
import { getCanvasPalette, useResolvedTheme } from '../lib/theme.js';
import type { TccDeviceView } from '../lib/tcc.js';
import { useCalculationStore } from '../store/calculationStore.js';
import { useEditorStore } from '../store/editorStore.js';

/** Свойства компонента графика ВТХ. */
export interface TccCurveChartProps {
    /** Идентификатор выбранного узла-аппарата. */
    readonly deviceId: string;
    /** Ток КЗ, A; если не задан, берётся из результата расчёта КЗ. */
    readonly shortCircuitCurrentA?: number;
    /** Закрыть диалог. */
    readonly onClose: () => void;
}

/** Размеры SVG-полотна в единицах viewBox. */
const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 420;
/** Отступы области построения. */
const MARGIN = { left: 68, right: 24, top: 24, bottom: 52 } as const;
/** Пределы оси времени, с. */
const TIME_MIN = 0.01;
const TIME_MAX = 3600;
/** Значения сетки по времени, с. */
const TIME_GRID: readonly number[] = [0.01, 0.1, 1, 10, 100, 1000, 3600];

/** Состояние всплывающей подсказки. */
interface TooltipState {
    /** Координата X указателя в единицах viewBox. */
    readonly svgX: number;
    /** Ток в точке указателя, A. */
    readonly currentA: number;
    /** Время срабатывания вышестоящего аппарата, с. */
    readonly timeUpS: number;
    /** Время срабатывания нижестоящего аппарата, с. */
    readonly timeDownS: number;
}

/**
 * Прочитать признак селективности пары из ответа (защита от версий контракта).
 * @param pair Пара ВТХ.
 * @returns true, если пара селективна.
 */
function pairOk(pair: TccSelectivityResponse['pairs'][number]): boolean {
    const raw: unknown = pair;
    if (typeof raw !== 'object' || raw === null) {
        return false;
    }
    if ('ok' in raw) {
        return raw.ok === true;
    }
    if ('selective' in raw) {
        return raw.selective === true;
    }
    return false;
}

/**
 * Форматировать время для подсказки.
 * @param seconds Время, с.
 * @returns Строка с единицей измерения.
 */
function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds)) {
        return '—';
    }
    if (seconds >= 100) {
        return `${seconds.toFixed(0)} с`;
    }
    if (seconds >= 1) {
        return `${seconds.toFixed(2)} с`;
    }
    return `${seconds.toFixed(3)} с`;
}

/**
 * Подпись узла для легенды.
 * @param device Аппарат ВТХ.
 * @returns Подпись или идентификатор.
 */
function legendName(device: TccDeviceView): string {
    const raw: unknown = device;
    if (typeof raw === 'object' && raw !== null && 'label' in raw && typeof raw.label === 'string' && raw.label.length > 0) {
        return raw.label;
    }
    return device.id;
}

/**
 * Диалог графика ВТХ с проверкой селективности и отключающей способности.
 * @param props Свойства компонента.
 * @returns React-элемент диалога.
 */
export function TccCurveChart({ deviceId, shortCircuitCurrentA, onClose }: TccCurveChartProps) {
    const { t } = useI18n();
    // Цвета графика привязаны к ролям Material 3 активной темы.
    const palette = getCanvasPalette(useResolvedTheme());
    const upColor = palette.cable;
    const downColor = palette.scale;
    const limitColor = palette.success;
    const graph = useEditorStore((state) => state.graph);
    const serverProjectId = useEditorStore((state) => state.serverProjectId);
    const calculatedIsc = useCalculationStore((state) => state.shortCircuit?.shortCircuitCurrentA);

    const [request, setRequest] = useState<TccSelectivityRequest | null>(null);
    const [response, setResponse] = useState<TccSelectivityResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [preview, setPreview] = useState(false);
    const [error, setError] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    const effectiveIsc = shortCircuitCurrentA ?? calculatedIsc;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        setTooltip(null);

        let built: TccSelectivityRequest;
        try {
            built = buildTccRequest(graph, deviceId, effectiveIsc);
        } catch {
            if (!cancelled) {
                setRequest(null);
                setResponse(null);
                setPreview(false);
                setError(true);
                setLoading(false);
            }
            return;
        }
        if (cancelled) {
            return;
        }
        setRequest(built);

        const usePreview = (): void => {
            if (!cancelled) {
                setResponse(computeTccPreview(built));
                setPreview(true);
                setLoading(false);
            }
        };

        if (serverProjectId === null) {
            usePreview();
            return;
        }
        const parsedId = UuidSchema.safeParse(serverProjectId);
        if (!parsedId.success) {
            usePreview();
            return;
        }
        void apiClient.selectivityTccAsync(parsedId.data, built)
            .then((result: TccSelectivityResponse) => {
                if (!cancelled) {
                    setResponse(result);
                    setPreview(false);
                    setLoading(false);
                }
            })
            .catch(() => {
                usePreview();
            });

        return () => {
            cancelled = true;
        };
    }, [graph, deviceId, effectiveIsc, serverProjectId, refreshKey]);

    const devices = request?.devices ?? [];
    const downstream = devices[0];
    const upstream = devices[1] ?? downstream;

    const limits = useMemo(() => {
        const minIn = downstream !== undefined
            ? Math.min(downstream.ratedCurrentA, upstream?.ratedCurrentA ?? downstream.ratedCurrentA)
            : 16;
        const maxIn = downstream !== undefined
            ? Math.max(downstream.ratedCurrentA, upstream?.ratedCurrentA ?? downstream.ratedCurrentA)
            : 16;
        const isc = request?.shortCircuitCurrentA ?? maxIn * 10;
        const xMin = Math.max(0.1, minIn * 0.8);
        const xMax = Math.max(maxIn * 20, isc * 1.5, xMin * 2);
        return { xMin, xMax, isc };
    }, [downstream, upstream, request]);

    const curves = useMemo(() => {
        if (downstream === undefined || upstream === undefined) {
            return null;
        }
        return {
            up: tccCurvePoints(upstream, limits.xMin, limits.xMax, 96),
            down: tccCurvePoints(downstream, limits.xMin, limits.xMax, 96),
        };
    }, [downstream, upstream, limits.xMin, limits.xMax]);

    const plotWidth = VIEW_WIDTH - MARGIN.left - MARGIN.right;
    const plotHeight = VIEW_HEIGHT - MARGIN.top - MARGIN.bottom;
    const xLogSpan = Math.log(limits.xMax / limits.xMin);
    const yLogSpan = Math.log(TIME_MAX / TIME_MIN);

    /** Перевести ток в координату X viewBox. */
    const currentToX = (currentA: number): number => {
        const safe = Math.min(limits.xMax, Math.max(limits.xMin, currentA));
        return MARGIN.left + (Math.log(safe / limits.xMin) / xLogSpan) * plotWidth;
    };

    /** Перевести время в координату Y viewBox. */
    const timeToY = (seconds: number): number => {
        const safe = Math.min(TIME_MAX, Math.max(TIME_MIN, seconds));
        return MARGIN.top + plotHeight - (Math.log(safe / TIME_MIN) / yLogSpan) * plotHeight;
    };

    /** Перевести координату X viewBox в ток. */
    const xToCurrent = (viewX: number): number => {
        const clamped = Math.min(MARGIN.left + plotWidth, Math.max(MARGIN.left, viewX));
        return limits.xMin * Math.exp(((clamped - MARGIN.left) / plotWidth) * xLogSpan);
    };

    const xGrid = useMemo(() => {
        const result: number[] = [];
        const start = Math.floor(Math.log10(limits.xMin));
        const end = Math.ceil(Math.log10(limits.xMax));
        for (let power = start; power <= end; power += 1) {
            const value = Math.pow(10, power);
            if (value >= limits.xMin && value <= limits.xMax) {
                result.push(value);
            }
        }
        return result;
    }, [limits.xMin, limits.xMax]);

    const handlePointer = (clientX: number): void => {
        if (downstream === undefined || upstream === undefined || svgRef.current === null) {
            return;
        }
        const rect = svgRef.current.getBoundingClientRect();
        if (rect.width <= 0) {
            return;
        }
        const viewX = ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
        const currentA = xToCurrent(viewX);
        setTooltip({
            svgX: currentToX(currentA),
            currentA,
            timeUpS: tripTime(upstream, currentA),
            timeDownS: tripTime(downstream, currentA),
        });
    };

    const handleMouseMove = (event: MouseEvent<SVGSVGElement>): void => {
        handlePointer(event.clientX);
    };

    const handleTouch = (event: TouchEvent<SVGSVGElement>): void => {
        const touch = event.touches[0];
        if (touch !== undefined) {
            handlePointer(touch.clientX);
        }
    };

    const pairs = response?.pairs ?? [];
    const selectivityLimit = response?.selectivityLimitA ?? 0;
    const statusKey: TranslationKey =
        pairs.length > 0 && pairs.every(pairOk) && selectivityLimit >= limits.isc
            ? 'tcc.status.full'
            : pairs.some(pairOk) || selectivityLimit > 0
                ? 'tcc.status.partial'
                : 'tcc.status.none';
    const icnKey: TranslationKey = response?.breakingCapacityOk === true ? 'tcc.icn.ok' : 'tcc.icn.bad';

    const polyline = (points: readonly { i: number; t: number }[]): string =>
        points.map((point) => `${currentToX(point.i).toFixed(2)},${timeToY(point.t).toFixed(2)}`).join(' ');

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: palette.background }}
        >
            <div
                className="flex max-h-full w-full max-w-4xl flex-col gap-3 overflow-y-auto rounded-lg border p-5 shadow-2xl"
                style={{ borderColor: palette.outlineVariant, backgroundColor: palette.surface, color: palette.onSurface }}
            >
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-base font-semibold">{t('tcc.title')}</h2>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setRefreshKey((value) => value + 1)}
                            className="rounded border px-3 py-1 text-xs hover:bg-surface-container"
                            style={{ borderColor: palette.outline, color: palette.onSurface }}
                        >
                            {t('tcc.refresh')}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded border px-3 py-1 text-xs hover:bg-surface-container"
                            style={{ borderColor: palette.outline, color: palette.onSurface }}
                        >
                            {t('tcc.close')}
                        </button>
                    </div>
                </div>

                {preview && (
                    <div className="rounded border border-tertiary bg-tertiary-container px-3 py-2 text-xs text-on-tertiary-container">
                        <div className="font-semibold">{t('tcc.preview')}</div>
                        <div>{t('tcc.approx')}</div>
                    </div>
                )}

                {error && (
                    <div className="rounded border border-error bg-error-container px-3 py-2 text-xs text-on-error-container">
                        {t('tcc.error')}
                    </div>
                )}

                {loading ? (
                    <div className="py-16 text-center text-sm" style={{ color: palette.onSurfaceVariant }}>{t('tcc.loading')}</div>
                ) : response !== null && curves !== null && downstream !== undefined && upstream !== undefined ? (
                    <>
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                            <span className={`rounded px-2 py-1 font-semibold ${statusKey === 'tcc.status.full' ? 'bg-emerald-700 text-emerald-100' : statusKey === 'tcc.status.partial' ? 'bg-amber-700 text-amber-100' : 'bg-rose-700 text-rose-100'}`}>
                                {t(statusKey)}
                            </span>
                            <span className={`rounded px-2 py-1 ${response.breakingCapacityOk ? 'bg-emerald-700 text-emerald-100' : 'bg-rose-700 text-rose-100'}`}>
                                {t(icnKey)}
                            </span>
                            <span style={{ color: palette.onSurfaceVariant }}>
                                {t('tcc.is')}: {selectivityLimit.toFixed(3)} A · {t('tcc.isc')}: {limits.isc.toFixed(1)} A
                            </span>
                        </div>

                        <div className="relative w-full">
                            <svg
                                ref={svgRef}
                                viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
                                className="h-auto w-full touch-none rounded"
                                style={{ backgroundColor: palette.surface }}
                                role="img"
                                aria-label={t('tcc.title')}
                                onMouseMove={handleMouseMove}
                                onMouseLeave={() => setTooltip(null)}
                                onTouchStart={handleTouch}
                                onTouchMove={handleTouch}
                                onTouchEnd={() => setTooltip(null)}
                            >
                                <rect
                                    x={MARGIN.left}
                                    y={MARGIN.top}
                                    width={plotWidth}
                                    height={plotHeight}
                                    fill="none"
                                    stroke={palette.outline}
                                />

                                {xGrid.map((value) => (
                                    <g key={`x-${value}`}>
                                        <line
                                            x1={currentToX(value)}
                                            x2={currentToX(value)}
                                            y1={MARGIN.top}
                                            y2={MARGIN.top + plotHeight}
                                            stroke={palette.outlineVariant}
                                        />
                                        <text
                                            x={currentToX(value)}
                                            y={MARGIN.top + plotHeight + 18}
                                            fill={palette.onSurfaceVariant}
                                            fontSize="11"
                                            textAnchor="middle"
                                        >
                                            {value >= 1000 ? `${value / 1000}k` : value.toFixed(0)}
                                        </text>
                                    </g>
                                ))}

                                {TIME_GRID.map((value) => (
                                    <g key={`y-${value}`}>
                                        <line
                                            x1={MARGIN.left}
                                            x2={MARGIN.left + plotWidth}
                                            y1={timeToY(value)}
                                            y2={timeToY(value)}
                                            stroke={palette.outlineVariant}
                                        />
                                        <text
                                            x={MARGIN.left - 8}
                                            y={timeToY(value) + 4}
                                            fill={palette.onSurfaceVariant}
                                            fontSize="11"
                                            textAnchor="end"
                                        >
                                            {value >= 1 ? value.toFixed(0) : value.toFixed(2)}
                                        </text>
                                    </g>
                                ))}

                                <text
                                    x={MARGIN.left + plotWidth / 2}
                                    y={VIEW_HEIGHT - 8}
                                    fill={palette.onSurface}
                                    fontSize="12"
                                    textAnchor="middle"
                                >
                                    {t('tcc.axisCurrent')}
                                </text>
                                <text
                                    x={16}
                                    y={MARGIN.top + plotHeight / 2}
                                    fill={palette.onSurface}
                                    fontSize="12"
                                    textAnchor="middle"
                                    transform={`rotate(-90 16 ${MARGIN.top + plotHeight / 2})`}
                                >
                                    {t('tcc.axisTime')}
                                </text>

                                {limits.isc >= limits.xMin && limits.isc <= limits.xMax && (
                                    <g>
                                        <line
                                            x1={currentToX(limits.isc)}
                                            x2={currentToX(limits.isc)}
                                            y1={MARGIN.top}
                                            y2={MARGIN.top + plotHeight}
                                            stroke={palette.error}
                                            strokeWidth="1.5"
                                            strokeDasharray="5 4"
                                        />
                                        <text
                                            x={currentToX(limits.isc) + 4}
                                            y={MARGIN.top + 12}
                                            fill={palette.error}
                                            fontSize="11"
                                        >
                                            {t('tcc.isc')} {limits.isc.toFixed(0)} A
                                        </text>
                                    </g>
                                )}

                                {selectivityLimit > 0 && selectivityLimit >= limits.xMin && selectivityLimit <= limits.xMax && (
                                    <g>
                                        <line
                                            x1={currentToX(selectivityLimit)}
                                            x2={currentToX(selectivityLimit)}
                                            y1={MARGIN.top}
                                            y2={MARGIN.top + plotHeight}
                                            stroke={limitColor}
                                            strokeWidth="1.5"
                                        />
                                        <text
                                            x={currentToX(selectivityLimit) + 4}
                                            y={MARGIN.top + 28}
                                            fill={limitColor}
                                            fontSize="11"
                                        >
                                            {t('tcc.is')} {selectivityLimit.toFixed(1)} A
                                        </text>
                                    </g>
                                )}

                                <polyline
                                    points={polyline(curves.up)}
                                    fill="none"
                                    stroke={upColor}
                                    strokeWidth="2.5"
                                />
                                <polyline
                                    points={polyline(curves.down)}
                                    fill="none"
                                    stroke={downColor}
                                    strokeWidth="2.5"
                                />

                                {tooltip !== null && (
                                    <g>
                                        <line
                                            x1={tooltip.svgX}
                                            x2={tooltip.svgX}
                                            y1={MARGIN.top}
                                            y2={MARGIN.top + plotHeight}
                                            stroke={palette.onSurface}
                                            strokeWidth="1"
                                            strokeDasharray="2 3"
                                        />
                                        <circle cx={tooltip.svgX} cy={timeToY(tooltip.timeUpS)} r="3.5" fill={upColor} />
                                        <circle cx={tooltip.svgX} cy={timeToY(tooltip.timeDownS)} r="3.5" fill={downColor} />
                                    </g>
                                )}
                            </svg>

                            {tooltip !== null && (
                                <div
                                    className="pointer-events-none absolute top-2 rounded border px-2 py-1 text-[10px] shadow"
                                    style={{
                                        left: `${Math.min(80, Math.max(0, (tooltip.svgX / VIEW_WIDTH) * 100))}%`,
                                        borderColor: palette.outline,
                                        backgroundColor: palette.surfaceContainer,
                                        color: palette.onSurface,
                                    }}
                                >
                                    <div>{t('tcc.axisCurrent')}: {tooltip.currentA.toFixed(1)} A</div>
                                    <div style={{ color: upColor }}>
                                        {t('tcc.device.up')}: {formatTime(tooltip.timeUpS)}
                                    </div>
                                    <div style={{ color: downColor }}>
                                        {t('tcc.device.down')}: {formatTime(tooltip.timeDownS)}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-4 text-xs" style={{ color: palette.onSurface }}>
                            <span className="font-semibold" style={{ color: palette.onSurfaceVariant }}>{t('tcc.legend')}</span>
                            <span className="flex items-center gap-2">
                                <span className="inline-block h-0.5 w-6" style={{ backgroundColor: upColor }} />
                                {t('tcc.device.up')} · {legendName(upstream)} · {upstream.tripCurve}
                            </span>
                            <span className="flex items-center gap-2">
                                <span className="inline-block h-0.5 w-6" style={{ backgroundColor: downColor }} />
                                {t('tcc.device.down')} · {legendName(downstream)} · {downstream.tripCurve}
                            </span>
                        </div>

                        <p className="text-xs" style={{ color: palette.onSurfaceVariant }}>{t('tcc.hint')}</p>

                        {response.warnings.length > 0 && (
                            <ul className="list-disc pl-5 text-[11px] text-error">
                                {response.warnings.map((warning) => (
                                    <li key={warning}>{warning}</li>
                                ))}
                            </ul>
                        )}
                    </>
                ) : (
                    <div className="py-16 text-center text-sm" style={{ color: palette.onSurfaceVariant }}>{t('tcc.error')}</div>
                )}
            </div>
        </div>
    );
}
