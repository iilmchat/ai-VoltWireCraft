// © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
import { UuidSchema, type RoomZoneType } from '@voltwirecraft/shared/graph.schema.js';
import { lazy, Suspense, useState } from 'react';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { apiClient } from '../lib/apiClient.js';
import { calculateLighting, fixturePositions } from '../lib/lighting.js';
import type { LightingResult } from '../lib/lighting.js';
import { useCalculationStore } from '../store/calculationStore.js';
import { useEditorStore } from '../store/editorStore.js';
import { ShortCircuitBadge } from './ShortCircuitBadge.js';

/** График ВТХ загружается только при открытии из инспектора. */
const TccCurveChart = lazy(() =>
    import('./TccCurveChart.js').then((module) => ({ default: module.TccCurveChart })),
);

/** Типы помещений, доступные в инспекторе. */
const ROOM_KINDS: readonly RoomZoneType[] = ['living', 'wet', 'kitchen', 'outdoor', 'utility'];

/**
 * Правая панель свойств узла, зоны или кабельной линии.
 * @returns React-элемент панели.
 */
export function InspectorPanel() {
    const { t } = useI18n();
    const graph = useEditorStore((state) => state.graph);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const selectedRoomId = useEditorStore((state) => state.selectedRoomId);
    const selectedEdgeId = useEditorStore((state) => state.selectedEdgeId);
    const shortCircuit = useCalculationStore((state) => state.shortCircuit);
    const serverProjectId = useEditorStore((state) => state.serverProjectId);
    const [tccOpen, setTccOpen] = useState(false);
    const [lumen, setLumen] = useState(1200);
    const [lightingResult, setLightingResult] = useState<LightingResult | null>(null);
    const [lightingBusy, setLightingBusy] = useState(false);
    const [lightingNotice, setLightingNotice] = useState<'offline' | 'failed' | null>(null);

    const node = graph.nodes.find((item) => item.id === selectedNodeId) ?? null;
    const room = graph.rooms.find((item) => item.id === selectedRoomId) ?? null;
    const edge = graph.edges.find((item) => item.id === selectedEdgeId) ?? null;
    const scale = graph.floorPlan.scaleMetersPerPx;
    const isProtectiveDevice =
        node !== null &&
        (node.kind === 'circuit_breaker' || node.kind === 'rcd' || node.kind === 'rcbo');
    const hasUpstream = isProtectiveDevice
        && graph.edges.some((item) => item.to === node.id && item.from !== node.id);

    /** Рассчитать освещённость: сервер, при ошибке — локальный предпросмотр. */
    const handleCalculateLighting = async (): Promise<void> => {
        if (room === null) {
            return;
        }
        setLightingBusy(true);
        setLightingNotice(null);
        const request = {
            polygonM: room.polygon.map((point) => ({ x: point.x, y: point.y })),
            ceilingHeightM: graph.floorPlan.ceilingHeightM,
            roomType: room.type,
            lumenPerFixture: lumen,
        };
        const parsedId = UuidSchema.safeParse(serverProjectId ?? '');
        try {
            const result = parsedId.success
                ? await apiClient.calculateLightingAsync(parsedId.data, request)
                : null;
            setLightingResult(result === null ? calculateLighting(request) : {
                ...result,
                targetLux: result.targetLux ?? calculateLighting(request).targetLux,
                references: result.references ?? [t('lighting.reference')],
            });
            if (result === null) {
                setLightingNotice('offline');
            }
        } catch {
            setLightingResult(calculateLighting(request));
            setLightingNotice('offline');
        } finally {
            setLightingBusy(false);
        }
    };

    /** Расставить рассчитанное число светильников равномерной сеткой. */
    const handlePlaceFixtures = (): void => {
        if (room === null || lightingResult === null) {
            return;
        }
        useEditorStore.getState().addLightingFixtures(
            room.id,
            fixturePositions(room, lightingResult.fixtureCount),
            lumen,
        );
    };

    return (
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
                {t('inspector.title')}
            </h2>

            {node !== null && (
                <div className="flex flex-col gap-4">
                    <div className="rounded bg-slate-800 px-3 py-2 text-xs text-slate-300">
                        {t(`device.${node.kind}` as TranslationKey)}
                    </div>
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('inspector.ugo')}</span>
                        <input
                            type="text"
                            value={node.label}
                            onChange={(event) =>
                                useEditorStore.getState().updateNode(node.id, { label: event.target.value })
                            }
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('inspector.power')}</span>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={node.specs.ratedPower}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value) && value >= 0) {
                                    useEditorStore.getState().updateNode(node.id, { ratedPower: value });
                                }
                            }}
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('sld.current')}, A</span>
                        <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={node.specs.ratedCurrent}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value) && value > 0) {
                                    useEditorStore.getState().updateNode(node.id, { ratedCurrent: value });
                                }
                            }}
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('inspector.height')}</span>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={node.specs.mountingHeight}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value) && value >= 0) {
                                    useEditorStore.getState().updateNode(node.id, { mountingHeight: value });
                                }
                            }}
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('inspector.room')}</span>
                        <select
                            value={node.roomId ?? ''}
                            onChange={(event) =>
                                useEditorStore.getState().updateNode(node.id, {
                                    roomId: event.target.value === '' ? null : event.target.value,
                                })
                            }
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        >
                            <option value="">{t('inspector.roomNone')}</option>
                            {graph.rooms.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <p className="text-xs text-slate-500">
                        {t('inspector.position')}:{' '}
                        {node.planPosition === null
                            ? '—'
                            : `${node.planPosition.x.toFixed(3)}, ${node.planPosition.y.toFixed(3)}`}
                    </p>
                    <ShortCircuitBadge />
                    {hasUpstream && node !== null && (
                        <button
                            type="button"
                            onClick={() => setTccOpen(true)}
                            className="w-full rounded border border-violet-600 px-3 py-2 text-xs font-medium text-violet-300 hover:bg-violet-950"
                        >
                            {t('tcc.title')}
                        </button>
                    )}
                </div>
            )}

            {node === null && room !== null && (
                <div className="flex flex-col gap-4">
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('inspector.roomName')}</span>
                        <input
                            type="text"
                            value={room.name}
                            onChange={(event) =>
                                useEditorStore.getState().updateRoom(room.id, { name: event.target.value })
                            }
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('inspector.roomType')}</span>
                        <select
                            value={room.type}
                            onChange={(event) =>
                                useEditorStore.getState().updateRoom(room.id, {
                                    type: event.target.value as RoomZoneType,
                                })
                            }
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        >
                            {ROOM_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                    {t(`room.${kind}` as TranslationKey)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className="rounded border border-slate-700 bg-slate-800/50 p-3">
                        <h3 className="mb-2 text-xs font-semibold text-slate-300">
                            {t('lighting.title')}
                        </h3>
                        <label className="mb-2 block">
                            <span className="mb-1 block text-[11px] text-slate-400">
                                {t('lighting.lumen')}
                            </span>
                            <input
                                type="number"
                                min="1"
                                step="100"
                                value={lumen}
                                onChange={(event) => {
                                    const value = Number(event.target.value);
                                    if (Number.isFinite(value) && value > 0) {
                                        setLumen(value);
                                    }
                                }}
                                className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                            />
                        </label>
                        <button
                            type="button"
                            disabled={lightingBusy}
                            onClick={() => void handleCalculateLighting()}
                            className="mb-2 w-full rounded border border-sky-600 px-2 py-1.5 text-xs text-sky-300 hover:bg-sky-950 disabled:opacity-50"
                        >
                            {lightingBusy ? t('lighting.calculating') : t('lighting.calculate')}
                        </button>
                        {lightingNotice !== null && (
                            <p className="mb-2 text-[11px] text-amber-300">
                                {t(lightingNotice === 'failed' ? 'lighting.failed' : 'lighting.offline')}
                            </p>
                        )}
                        {lightingResult !== null && (
                            <div className="mb-2 space-y-1 text-[11px] text-slate-300">
                                <p className="font-medium text-slate-200">{t('lighting.result')}</p>
                                <p>{t('lighting.area')}: {lightingResult.areaM2.toFixed(2)}</p>
                                <p>{t('lighting.index')}: {lightingResult.roomIndex.toFixed(2)}</p>
                                <p>{t('lighting.utilization')}: {lightingResult.utilizationFactor.toFixed(2)}</p>
                                <p>{t('lighting.fixtures')}: {lightingResult.fixtureCount}</p>
                                <p className="text-slate-500">{lightingResult.references.join(', ')}</p>
                            </div>
                        )}
                        {lightingResult !== null && lightingResult.fixtureCount > 0 && (
                            <button
                                type="button"
                                onClick={handlePlaceFixtures}
                                className="w-full rounded bg-sky-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                            >
                                {t('lighting.place')}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {node === null && room === null && edge !== null && (
                <div className="flex flex-col gap-4">
                    <div className="rounded bg-slate-800 px-3 py-2 text-xs text-slate-300">
                        {edge.edgeType === 'cable_line' ? t('cable.type') : t('inspector.cableLine')}
                    </div>
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('cable.brand')}</span>
                        <input
                            type="text"
                            value={edge.cableBrand ?? ''}
                            onChange={(event) =>
                                useEditorStore.getState().updateEdge(edge.id, { cableBrand: event.target.value })
                            }
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('cable.crossSection')}</span>
                        <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={edge.cableSpecs.crossSection}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value) && value > 0) {
                                    useEditorStore.getState().updateEdge(edge.id, { crossSection: value });
                                }
                            }}
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('cable.conductors')}</span>
                        <input
                            type="number"
                            min="1"
                            step="1"
                            value={edge.cableSpecs.conductorCount}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value) && value > 0) {
                                    useEditorStore.getState().updateEdge(edge.id, { conductorCount: value });
                                }
                            }}
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        />
                    </label>
                    <p className="text-xs text-slate-500">
                        {t('cable.waypoints')}: {edge.waypointsPx?.length ?? 0}
                    </p>
                    <ShortCircuitBadge />
                </div>
            )}

            {node === null && room === null && edge === null && (
                <div className="flex flex-col gap-3 text-sm text-slate-400">
                    <p>{t('inspector.noSelection')}</p>
                    <div className="mt-2 rounded border border-slate-700 bg-slate-800/50 p-3 text-xs">
                        <p className="mb-2 font-medium text-slate-300">{t('inspector.floorPlan')}</p>
                        <p className="mb-1">
                            {t('inspector.scaleValue')}:{' '}
                            {scale === null ? t('scale.notCalibrated') : scale.toFixed(6)}
                        </p>
                        <p>
                            {graph.floorPlan.background === null
                                ? t('inspector.backgroundNone')
                                : graph.floorPlan.background.name}
                        </p>
                    </div>
                </div>
            )}

            {tccOpen && node !== null && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-4">
                    <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 p-4 shadow-2xl">
                        <Suspense fallback={<p className="p-8 text-center text-sm text-slate-400">{t('tcc.loading')}</p>}>
                            <TccCurveChart
                                deviceId={node.id}
                                shortCircuitCurrentA={shortCircuit?.shortCircuitCurrentA}
                                onClose={() => setTccOpen(false)}
                            />
                        </Suspense>
                    </div>
                </div>
            )}
        </aside>
    );
}
