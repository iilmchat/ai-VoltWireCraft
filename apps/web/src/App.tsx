// © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
/** Корневой компонент: оболочка редактора с вкладками проекций графа. */
import { useEffect, useState } from 'react';
import { AiAssistantDrawer } from './components/AiAssistantDrawer.js';
import { BillOfMaterialsTable } from './components/BillOfMaterialsTable.js';
import { FloorPlanEditor } from './components/FloorPlanEditor.js';
import { GostDocsPanel } from './components/GostDocsPanel.js';
import { Header } from './components/Header.js';
import { InspectorPanel } from './components/InspectorPanel.js';
import { Panel3DView } from './components/Panel3DView.js';
import { PanelLayoutEditor } from './components/PanelLayoutEditor.js';
import { Palette } from './components/Palette.js';
import { SingleLineDiagramView } from './components/SingleLineDiagramView.js';
import { I18nProvider, useI18n } from './i18n/index.js';
import type { Locale, TranslationKey } from './i18n/index.js';
import { useEditorStore } from './store/editorStore.js';
import { useUiStore } from './store/uiStore.js';
import type { WorkspaceView } from './store/uiStore.js';

/** Перечень вкладок рабочей области. */
const VIEWS: readonly WorkspaceView[] = ['plan', 'panel', 'panel3d', 'singleLine', 'bom'];

/**
 * Корневой компонент приложения: подключает локализацию и оболочку.
 * @returns React-элемент приложения.
 */
export function App() {
    const [locale, setLocale] = useState<Locale>('ru');
    return (
        <I18nProvider locale={locale} setLocale={setLocale}>
            <AppShell />
        </I18nProvider>
    );
}

/**
 * Проверить, что горячая клавиша не перехватывается полем ввода.
 * @param target Цель события клавиатуры.
 * @returns true, если событие пришло из текстового поля.
 */
function isTextInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Оболочка редактора: шапка, вкладки, рабочая область и панели.
 * @returns React-элемент оболочки.
 */
function AppShell() {
    const { t } = useI18n();
    const activeView = useUiStore((state) => state.activeView);
    const setActiveView = useUiStore((state) => state.setActiveView);
    const gostPanelOpen = useUiStore((state) => state.gostPanelOpen);
    const setGostPanelOpen = useUiStore((state) => state.setGostPanelOpen);

    // Undo/Redo: Ctrl+Z / Ctrl+Y (RULES § 2.4 DESIGN_V040 — история сессии).
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (!event.ctrlKey && !event.metaKey) {
                return;
            }
            if (isTextInput(event.target)) {
                return;
            }
            const key = event.key.toLowerCase();
            if (key === 'z' && !event.shiftKey) {
                event.preventDefault();
                useEditorStore.getState().undo();
            } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
                event.preventDefault();
                useEditorStore.getState().redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="flex h-full flex-col bg-slate-950 text-slate-100">
            <Header />
            <nav className="flex shrink-0 gap-1 border-b border-slate-700 bg-slate-900 px-4" aria-label={t('app.title')}>
                {VIEWS.map((view) => (
                    <button
                        key={view}
                        type="button"
                        onClick={() => setActiveView(view)}
                        className={`border-b-2 px-4 py-2 text-sm ${
                            activeView === view
                                ? 'border-sky-400 font-medium text-sky-300'
                                : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        {t(`tab.${view}` as TranslationKey)}
                    </button>
                ))}
            </nav>
            <div className="flex min-h-0 flex-1">
                <Palette />
                <main className="min-w-0 flex-1 overflow-auto">
                    {activeView === 'plan' && <FloorPlanEditor />}
                    {activeView === 'panel' && <PanelLayoutEditor />}
                    {activeView === 'panel3d' && <Panel3DView />}
                    {activeView === 'singleLine' && <SingleLineDiagramView />}
                    {activeView === 'bom' && <BillOfMaterialsTable />}
                </main>
                <InspectorPanel />
                <AiAssistantDrawer />
            </div>
            <GostDocsPanel open={gostPanelOpen} onClose={() => setGostPanelOpen(false)} />
        </div>
    );
}
