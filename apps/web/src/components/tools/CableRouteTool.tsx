// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { useI18n } from '../../i18n/index.js';
import { useEditorStore } from '../../store/editorStore.js';

/**
 * Панель инструмента трассировки кабеля.
 * @returns React-элемент панели или null.
 */
export function CableRouteTool() {
    const { t } = useI18n();
    const tool = useEditorStore((state) => state.tool);
    const cableDraft = useEditorStore((state) => state.cableDraft);
    const nodes = useEditorStore((state) => state.graph.nodes);

    if (tool !== 'cable') {
        return null;
    }

    const source = cableDraft === null
        ? undefined
        : nodes.find((node) => node.id === cableDraft.sourceNodeId);
    const waypointCount = cableDraft?.waypointsPx.length ?? 0;

    return (
        <div className="absolute left-4 top-4 w-72 rounded-lg border border-pink-500/60 bg-slate-900/95 p-4 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold text-pink-300">{t('tool.cable')}</h3>
            <p className="mb-3 text-xs text-slate-400">{t('hint.cable')}</p>
            <p className="mb-3 text-xs text-slate-300">
                {t('cable.source')}: {source?.label ?? t('cable.noSource')}
                <br />
                {t('cable.waypoints')}: {waypointCount}
            </p>
            <button
                type="button"
                disabled={cableDraft === null || waypointCount < 1}
                onClick={() => useEditorStore.getState().cancelCable()}
                className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
                {t('scale.cancel')}
            </button>
        </div>
    );
}
