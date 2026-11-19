// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { ROOM_TYPES } from '@voltwirecraft/shared';
import type { RoomType } from '@voltwirecraft/shared';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { useEditorStore } from '../store/editorStore.js';

/**
 * Правая панель свойств выбранного ЭУИ или помещения.
 * @returns React-элемент панели.
 */
export function InspectorPanel() {
    const { t } = useI18n();
    const graph = useEditorStore((state) => state.graph);
    const selectedDeviceId = useEditorStore((state) => state.selectedDeviceId);
    const selectedRoomId = useEditorStore((state) => state.selectedRoomId);

    const device = graph.devices.find((item) => item.id === selectedDeviceId) ?? null;
    const room = graph.rooms.find((item) => item.id === selectedRoomId) ?? null;
    const scale = graph.floorPlan.scaleMetersPerPx;

    return (
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
                {t('inspector.title')}
            </h2>

            {device !== null && (
                <div className="flex flex-col gap-4">
                    <div className="rounded bg-slate-800 px-3 py-2 text-xs text-slate-300">
                        {t(`device.${device.kind}` as TranslationKey)}
                    </div>
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('inspector.ugo')}</span>
                        <input
                            type="text"
                            value={device.ugo}
                            onChange={(event) =>
                                useEditorStore.getState().updateDevice(device.id, { ugo: event.target.value })
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
                            value={device.powerW}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value) && value >= 0) {
                                    useEditorStore.getState().updateDevice(device.id, { powerW: value });
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
                            value={device.mountingHeightM}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value) && value >= 0) {
                                    useEditorStore.getState().updateDevice(device.id, { mountingHeightM: value });
                                }
                            }}
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{t('inspector.room')}</span>
                        <select
                            value={device.roomId ?? ''}
                            onChange={(event) =>
                                useEditorStore.getState().updateDevice(device.id, {
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
                        {t('inspector.position')}: {device.position.x.toFixed(3)}, {device.position.y.toFixed(3)}
                    </p>
                </div>
            )}

            {device === null && room !== null && (
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
                                    type: event.target.value as RoomType,
                                })
                            }
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        >
                            {ROOM_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {t(`room.${type}` as TranslationKey)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <p className="text-xs text-slate-500">
                        {t('palette.roomType')}: {t(`room.${room.type}` as TranslationKey)}
                    </p>
                </div>
            )}

            {device === null && room === null && (
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
