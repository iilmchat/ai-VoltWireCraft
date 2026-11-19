// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { DEVICE_KINDS } from '@voltwirecraft/shared';
import type { DeviceKind } from '@voltwirecraft/shared';
import { useI18n } from '../../i18n/index.js';
import type { TranslationKey } from '../../i18n/index.js';
import { useEditorStore } from '../../store/editorStore.js';

/** MIME-тип переноса ЭУИ из палитры на холст. */
export const DEVICE_DRAG_MIME = 'application/x-vwc-device';

/**
 * Палитра ЭУИ и щита с drag-and-drop и установкой кликом.
 * @returns React-элемент палитры или null.
 */
export function DevicePlacementTool() {
    const { t } = useI18n();
    const tool = useEditorStore((state) => state.tool);
    const armedDeviceKind = useEditorStore((state) => state.armedDeviceKind);

    if (tool !== 'device') {
        return null;
    }

    const arm = (kind: DeviceKind): void => {
        const store = useEditorStore.getState();
        store.setArmedDeviceKind(store.armedDeviceKind === kind ? null : kind);
    };

    return (
        <div className="mt-4 border-t border-slate-700 pt-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-200">{t('palette.devicePalette')}</h3>
            <p className="mb-3 text-xs text-slate-400">{t('palette.dragHint')}</p>
            <div className="grid grid-cols-2 gap-2">
                {DEVICE_KINDS.map((kind) => (
                    <button
                        key={kind}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                            event.dataTransfer.setData(DEVICE_DRAG_MIME, kind);
                            event.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => arm(kind)}
                        className={`rounded border px-2 py-2 text-xs text-left transition-colors ${
                            armedDeviceKind === kind
                                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                                : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-400'
                        }`}
                    >
                        {t(`device.${kind}` as TranslationKey)}
                    </button>
                ))}
            </div>
        </div>
    );
}
