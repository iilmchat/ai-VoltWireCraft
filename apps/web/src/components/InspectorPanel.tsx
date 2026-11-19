// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import type { RoomZoneType } from '@voltwirecraft/shared/graph.schema.js';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { useEditorStore } from '../store/editorStore.js';

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

    const node = graph.nodes.find((item) => item.id === selectedNodeId) ?? null;
    const room = graph.rooms.find((item) => item.id === selectedRoomId) ?? null;
    const edge = graph.edges.find((item) => item.id === selectedEdgeId) ?? null;
    const scale = graph.floorPlan.scaleMetersPerPx;

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
        </aside>
    );
}
