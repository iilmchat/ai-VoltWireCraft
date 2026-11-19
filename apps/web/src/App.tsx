// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Корневой компонент: оболочка редактора с вкладками проекций графа. */
import { useState } from 'react';
import { AiAssistantDrawer } from './components/AiAssistantDrawer.js';
import { BillOfMaterialsTable } from './components/BillOfMaterialsTable.js';
import { FloorPlanEditor } from './components/FloorPlanEditor.js';
import { Header } from './components/Header.js';
import { InspectorPanel } from './components/InspectorPanel.js';
import { PanelLayoutEditor } from './components/PanelLayoutEditor.js';
import { Palette } from './components/Palette.js';
import { SingleLineDiagramView } from './components/SingleLineDiagramView.js';
import { I18nProvider, useI18n } from './i18n/index.js';
import type { Locale, TranslationKey } from './i18n/index.js';
import { useUiStore } from './store/uiStore.js';
import type { WorkspaceView } from './store/uiStore.js';

/** Перечень вкладок рабочей области. */
const VIEWS: readonly WorkspaceView[] = ['plan', 'panel', 'singleLine', 'bom'];

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
 * Оболочка редактора: шапка, вкладки, рабочая область и панели.
 * @returns React-элемент оболочки.
 */
function AppShell() {
    const { t } = useI18n();
    const activeView = useUiStore((state) => state.activeView);
    const setActiveView = useUiStore((state) => state.setActiveView);

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
                    {activeView === 'singleLine' && <SingleLineDiagramView />}
                    {activeView === 'bom' && <BillOfMaterialsTable />}
                </main>
                <InspectorPanel />
                <AiAssistantDrawer />
            </div>
        </div>
    );
}
