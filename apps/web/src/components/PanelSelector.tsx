// © 2026 RuChating (iilmchat) · VoltWireCraft v0.6.0
/**
 * Селектор активного щита: контекст сессии для 2D-, 3D- и схемной проекций.
 * Переключение не изменяет канонический граф (RULES § 5.2).
 */
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { getPanels, resolveActivePanelId } from '../lib/panelHierarchy.js';
import type { PanelRole } from '../lib/panelHierarchy.js';
import { useEditorStore } from '../store/editorStore.js';
import { useUiStore } from '../store/uiStore.js';
import type { WorkspaceView } from '../store/uiStore.js';

/** Виды, в которых показывается селектор. */
const PANEL_VIEWS: readonly WorkspaceView[] = ['panel', 'panel3d', 'singleLine'];

/** Локализованная роль щита. */
const ROLE_KEYS: Readonly<Record<PanelRole, TranslationKey>> = {
    main_vru: 'panelRole.main_vru' as TranslationKey,
    sub_shr: 'panelRole.sub_shr' as TranslationKey,
    lighting_sho: 'panelRole.lighting_sho' as TranslationKey,
};

/**
 * Панель выбора активного щита.
 * @param props Активный вид рабочей области.
 * @returns React-элемент селектора или null.
 */
export function PanelSelector({ activeView }: { activeView: WorkspaceView }) {
    const { t } = useI18n();
    const graph = useEditorStore((state) => state.graph);
    const activePanelId = useUiStore((state) => state.activePanelId);
    const setActivePanelId = useUiStore((state) => state.setActivePanelId);

    if (!PANEL_VIEWS.includes(activeView)) {
        return null;
    }

    const panels = getPanels(graph);
    const resolvedId = resolveActivePanelId(graph, activePanelId);
    if (resolvedId === null) {
        return null;
    }

    const active = panels.find((panel) => panel.node.id === resolvedId);

    /** Добавить дочерний щит и сделать его активным. */
    const handleAdd = (): void => {
        const id = useEditorStore.getState().addDistributionPanel(resolvedId);
        if (id !== null) {
            setActivePanelId(id);
        }
    };

    return (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-700 bg-slate-900/70 px-4 py-1.5">
            <span className="text-xs text-slate-400">{t('panelSelector.title')}</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label={t('panelSelector.title')}>
                {panels.map((panel) => {
                    const selected = panel.node.id === resolvedId;
                    return (
                        <button
                            key={panel.node.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setActivePanelId(panel.node.id)}
                            className={`rounded border px-2.5 py-1 text-xs ${
                                selected
                                    ? 'border-sky-400 bg-sky-950/60 text-sky-200'
                                    : 'border-slate-600 text-slate-300 hover:bg-slate-800'
                            }`}
                        >
                            {panel.node.label}
                            <span className="ml-1 opacity-60">{t(ROLE_KEYS[panel.role])}</span>
                        </button>
                    );
                })}
            </div>
            {active !== undefined && (
                <span className="hidden text-[11px] text-slate-500 lg:inline">
                    {active.parentPanelId === null
                        ? t('panelSelector.root')
                        : t('panelSelector.child')}
                </span>
            )}
            <button
                type="button"
                onClick={handleAdd}
                className="rounded border border-indigo-600 px-2.5 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-950"
            >
                + {t('panelSelector.add')}
            </button>
        </div>
    );
}
