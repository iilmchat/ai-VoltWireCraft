// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Корневой компонент: оболочка редактора с вкладками проекций графа. */
import { lazy, Suspense, useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { AiAssistantDrawer } from './components/AiAssistantDrawer.js';
import { CommentsDrawer } from './components/CommentsDrawer.js';
import { FloorPlanEditor } from './components/FloorPlanEditor.js';
import { Header } from './components/Header.js';
import { InspectorPanel } from './components/InspectorPanel.js';
import { PanelLayoutEditor } from './components/PanelLayoutEditor.js';
import { PanelSelector } from './components/PanelSelector.js';
import { Palette } from './components/Palette.js';
import { isDesktop } from './lib/tauriAdapter.js';

import type { DemoProjectId } from './lib/demoProjects.js';
import { I18nProvider, dictionaries, useI18n } from './i18n/index.js';
import type { Locale, TranslationKey } from './i18n/index.js';
import { useAuthStore } from './store/authStore.js';
import { useEditorStore } from './store/editorStore.js';
import { useUiStore } from './store/uiStore.js';
import type { WorkspaceView } from './store/uiStore.js';

/** Перечень вкладок рабочей области. */
const VIEWS: readonly WorkspaceView[] = ['plan', 'panel', 'panel3d', 'singleLine', 'bom', 'grounding'];

/**
 * Отложенная загрузка 3D-проекции: Three.js не попадает в основной чанк (DESIGN_V050 § 2.3).
 * Динамический импорт объявлен один раз и переиспользуется React и предзагрузкой.
 */
/** Модуль отложенной загрузки: именованный экспорт приводится к default для React.lazy. */
type LazyPanel3DModule = { default: ComponentType };

const loadPanel3DViewAsync = (): Promise<LazyPanel3DModule> =>
    import('./components/Panel3DView.js').then((module) => ({ default: module.Panel3DView }));
const Panel3DView = lazy(loadPanel3DViewAsync);

/** Остальные тяжёлые проекции и форма РД загружаются по требованию. */
const SingleLineDiagramView = lazy(() =>
    import('./components/SingleLineDiagramView.js').then((module) => ({ default: module.SingleLineDiagramView })),
);
const BillOfMaterialsTable = lazy(() =>
    import('./components/BillOfMaterialsTable.js').then((module) => ({ default: module.BillOfMaterialsTable })),
);
const GostDocsPanel = lazy(() =>
    import('./components/GostDocsPanel.js').then((module) => ({ default: module.GostDocsPanel })),
);
/** Лендинг загружается только в веб-режиме на корневом пути. */
const LandingPage = lazy(() =>
    import('./components/LandingPage.js').then((module) => ({ default: module.LandingPage })),
);
/** Кабинет и инструмент заземления загружаются по требованию. */
const ProjectsDashboard = lazy(() =>
    import('./components/ProjectsDashboard.js').then((module) => ({ default: module.ProjectsDashboard })),
);
const GroundingCalculatorPanel = lazy(() =>
    import('./components/GroundingCalculatorPanel.js').then((module) => ({ default: module.GroundingCalculatorPanel })),
);

/**
 * Скелетон на время загрузки чанка Three.js.
 * @returns React-элемент скелетона вкладки.
 */
function Panel3DSkeleton() {
    const { t } = useI18n();
    return (
        <section
            className="flex h-full min-h-[420px] w-full flex-col items-center justify-center gap-4 bg-slate-950 p-8"
            aria-busy="true"
            aria-label={t('panel3d.loading')}
        >
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-sky-400" />
            <div className="h-3 w-56 animate-pulse rounded bg-slate-800" />
            <div className="h-3 w-40 animate-pulse rounded bg-slate-800/70" />
            <p className="text-sm text-slate-400">{t('panel3d.loading')}</p>
        </section>
    );
}

/**
 * Корневой компонент приложения: подключает локализацию и оболочку.
 * @returns React-элемент приложения.
 */
export function App() {
    const [locale, setLocale] = useState<Locale>('ru');
    const [path, setPath] = useState(() => window.location.pathname);
    const desktop = isDesktop();

    useEffect(() => {
        const onPopState = (): void => setPath(window.location.pathname);
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    /** Перейти к другому SPA-маршруту. */
    const navigate = (nextPath: string): void => {
        window.history.pushState({}, '', nextPath);
        setPath(nextPath);
    };

    /** Открыть демо-проект и сразу перейти в редактор. */
    const openDemo = (id: DemoProjectId): void => {
        useEditorStore.getState().loadDemoProject(id);
        navigate('/editor');
    };

    // Личный кабинет доступен только в веб-режиме (десктоп работает офлайн).
    if (!desktop && path === '/dashboard') {
        return (
            <I18nProvider locale={locale} setLocale={setLocale}>
                <Suspense fallback={<div className="p-8 text-sm text-slate-400">{dictionaries[locale]['view.loading']}</div>}>
                    <ProjectsDashboard
                        open
                        onClose={() => navigate('/editor')}
                        onOpenProject={() => navigate('/editor')}
                    />
                </Suspense>
            </I18nProvider>
        );
    }

    // В Tauri всегда открывается редактор без публичного лендинга (DESIGN_V080 § 2.3).
    if (!desktop && path !== '/editor') {
        return (
            <I18nProvider locale={locale} setLocale={setLocale}>
                <Suspense fallback={<div className="p-8 text-sm text-slate-400">{dictionaries[locale]['view.loading']}</div>}>
                    <LandingPage onOpenEditor={() => navigate('/editor')} onLoadDemo={openDemo} />
                </Suspense>
            </I18nProvider>
        );
    }

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
    const setActivePanelId = useUiStore((state) => state.setActivePanelId);
    const graphId = useEditorStore((state) => state.graph.id);
    const userRole = useAuthStore((state) => state.user?.role ?? null);
    const readOnly = userRole === 'client';

    // При загрузке другого проекта сбрасываем контекст активного щита сессии.
    useEffect(() => {
        setActivePanelId(null);
    }, [graphId, setActivePanelId]);

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
                        onMouseEnter={view === 'panel3d' ? () => void loadPanel3DViewAsync() : undefined}
                        onFocus={view === 'panel3d' ? () => void loadPanel3DViewAsync() : undefined}
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
            <PanelSelector activeView={activeView} />
            {readOnly && (
                <p role="status" className="border-b border-amber-700 bg-amber-950/60 px-4 py-1 text-xs text-amber-300">
                    {t('comments.readOnly')}
                </p>
            )}
            <div className="flex min-h-0 flex-1">
                <fieldset disabled={readOnly} className="contents">
                    <Palette />
                </fieldset>
                <main className="min-w-0 flex-1 overflow-auto">
                    {activeView === 'plan' && <FloorPlanEditor />}
                    {activeView === 'panel' && <PanelLayoutEditor />}
                    {activeView === 'panel3d' && (
                        <Suspense fallback={<Panel3DSkeleton />}>
                            <Panel3DView />
                        </Suspense>
                    )}
                    {activeView === 'singleLine' && (
                        <Suspense fallback={<div className="p-8 text-sm text-slate-400">{t('view.loading')}</div>}>
                            <SingleLineDiagramView />
                        </Suspense>
                    )}
                    {activeView === 'bom' && (
                        <Suspense fallback={<div className="p-8 text-sm text-slate-400">{t('view.loading')}</div>}>
                            <BillOfMaterialsTable />
                        </Suspense>
                    )}
                    {activeView === 'grounding' && (
                        <Suspense fallback={<div className="p-8 text-sm text-slate-400">{t('view.loading')}</div>}>
                            <GroundingCalculatorPanel />
                        </Suspense>
                    )}
                </main>
                <fieldset disabled={readOnly} className="contents">
                    <InspectorPanel />
                </fieldset>
                <CommentsDrawer />
                <AiAssistantDrawer />
            </div>
            {gostPanelOpen && (
                <Suspense fallback={null}>
                    <GostDocsPanel open onClose={() => setGostPanelOpen(false)} />
                </Suspense>
            )}
        </div>
    );
}
