// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { useI18n } from '../../i18n/index.js';
import type { TranslationKey } from '../../i18n/index.js';
import { useEditorStore } from '../../store/editorStore.js';
import type { UiRoomKind } from '../../store/editorStore.js';

/** Типы помещений, доступные в палитре редактора. */
const UI_ROOM_TYPES: readonly UiRoomKind[] = ['living', 'wet', 'kitchen', 'outdoor', 'utility'];

/**
 * Панель инструмента зонирования: тип помещения и управление контуром.
 * @returns React-элемент панели или null.
 */
export function RoomZoneTool() {
    const { t } = useI18n();
    const tool = useEditorStore((state) => state.tool);
    const roomDraftKind = useEditorStore((state) => state.roomDraftKind);
    const vertexCount = useEditorStore((state) => state.roomDraft.length);

    if (tool !== 'room') {
        return null;
    }

    return (
        <div className="absolute left-4 top-4 w-64 rounded-lg border border-sky-500/60 bg-slate-900/95 p-4 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold text-sky-300">{t('tool.room')}</h3>
            <label className="mb-1 block text-xs text-slate-300" htmlFor="room-type">
                {t('palette.roomType')}
            </label>
            <select
                id="room-type"
                value={roomDraftKind}
                onChange={(event) =>
                    useEditorStore.getState().setRoomDraftKind(event.target.value as UiRoomKind)
                }
                className="mb-3 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100"
            >
                {UI_ROOM_TYPES.map((type) => (
                    <option key={type} value={type}>
                        {t(`room.${type}` as TranslationKey)}
                    </option>
                ))}
            </select>
            <p className="mb-3 text-xs text-slate-400">
                {t('hint.room')} · {vertexCount}
            </p>
            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={vertexCount < 3}
                    onClick={() => useEditorStore.getState().finishRoom()}
                    className="rounded bg-sky-500 px-3 py-1 text-xs font-medium text-slate-900 disabled:opacity-40"
                >
                    {t('common.apply')}
                </button>
                <button
                    type="button"
                    onClick={() => useEditorStore.getState().clearRoomDraft()}
                    className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                    {t('scale.cancel')}
                </button>
            </div>
        </div>
    );
}
