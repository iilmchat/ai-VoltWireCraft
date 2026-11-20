// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { UuidSchema } from '@voltwirecraft/shared/graph.schema.js';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useI18n } from '../i18n/index.js';
import type { Locale, TranslationKey } from '../i18n/index.js';
import { ApiClientError, apiClient } from '../lib/apiClient.js';
import { DEMO_PROJECTS } from '../lib/demoProjects.js';
import type { DemoProjectId } from '../lib/demoProjects.js';
import {
    openProjectAsync,
    parseProject,
    saveProjectAsync,
} from '../lib/persistence.js';
import type { ImportErrorCode } from '../lib/persistence.js';
import { isDesktop } from '../lib/tauriAdapter.js';
import { useCalculationStore } from '../store/calculationStore.js';
import { useEditorStore } from '../store/editorStore.js';
import { useUiStore } from '../store/uiStore.js';

/**
 * Верхняя панель: проект, язык, офлайн-файл и серверное хранение.
 * @returns React-элемент шапки.
 */
export function Header() {
    const { t, locale, setLocale } = useI18n();
    const graph = useEditorStore((state) => state.graph);
    const serverProjectId = useEditorStore((state) => state.serverProjectId);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const cadFileRef = useRef<HTMLInputElement | null>(null);
    const [demoMenuOpen, setDemoMenuOpen] = useState(false);
    const canUndo = useEditorStore((state) => state.past.length > 0);
    const canRedo = useEditorStore((state) => state.future.length > 0);
    const desktop = isDesktop();

    /** Загрузить эталонный проект золотого датасета в офлайн-режиме. */
    const handleLoadDemo = (id: DemoProjectId): void => {
        useEditorStore.getState().loadDemoProject(id);
        setDemoMenuOpen(false);
    };

    const importErrorKeys: Record<ImportErrorCode, Parameters<typeof t>[0]> = {
        invalidJson: 'import.invalidJson',
        invalidFormat: 'import.invalidFormat',
        newerVersion: 'import.newerVersion',
        olderVersion: 'import.olderVersion',
        invalidGraph: 'import.invalidGraph',
        unknown: 'import.unknown',
    };

    const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = event.target.files?.[0];
        if (file === undefined) {
            return;
        }
        try {
            const text = await file.text();
            const result = parseProject(text);
            if (result.ok) {
                useEditorStore.getState().setGraph(result.graph);
            } else {
                useEditorStore.getState().setStatus(importErrorKeys[result.code]);
            }
        } catch {
            useEditorStore.getState().setStatus('import.unknown');
        }
        event.target.value = '';
    };

    const projectBaseName = (): string => {
        const name = graph.name.replace(/[^\p{L}\p{N}._-]+/gu, '_');
        return name.length > 0 ? name : 'project';
    };

    const handleExport = async (): Promise<void> => {
        await saveProjectAsync(graph, projectBaseName());
        useEditorStore.getState().setStatus('status.projectSaved');
    };

    const handleNativeSave = async (): Promise<void> => {
        const saved = await saveProjectAsync(graph, projectBaseName());
        if (saved) {
            useEditorStore.getState().setStatus('status.nativeSaved');
        }
    };

    const handleNativeOpen = async (): Promise<void> => {
        try {
            const text = await openProjectAsync();
            if (text === null) {
                return;
            }
            const result = parseProject(text);
            if (result.ok) {
                useEditorStore.getState().setGraph(result.graph);
                useEditorStore.getState().setStatus('status.nativeOpened');
            } else {
                useEditorStore.getState().setStatus(importErrorKeys[result.code]);
            }
        } catch {
            useEditorStore.getState().setStatus('import.unknown');
        }
    };

    const handleCadImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = event.target.files?.[0];
        if (file === undefined) {
            return;
        }
        try {
            if (serverProjectId === null) {
                useEditorStore.getState().setStatus('cad.noProject');
                return;
            }
            const parsed = UuidSchema.safeParse(serverProjectId);
            if (!parsed.success) {
                useEditorStore.getState().setStatus('cad.failed');
                return;
            }
            const result = await apiClient.importCadAsync(parsed.data, file);
            useEditorStore.getState().setGraph(result.graph);
            useEditorStore.getState().setStatus('status.dxfImported');
        } catch {
            useEditorStore.getState().setStatus('cad.failed');
        }
        event.target.value = '';
    };

    const handleCalculate = async (): Promise<void> => {
        await useCalculationStore.getState().loadShortCircuitAsync();
    };

    const handleSaveServer = async (): Promise<void> => {
        try {
            let id = serverProjectId;
            if (id === null) {
                const project = await apiClient.createProjectAsync({
                    title: graph.name,
                    objectType: 'house',
                    networkSystem: 'tn-c-s',
                });
                id = project.id;
                useEditorStore.getState().setServerProjectId(id);
            }
            const validId = UuidSchema.safeParse(id);
            if (!validId.success) {
                useEditorStore.getState().setStatus('api.saveFailed');
                return;
            }
            await apiClient.updateProjectGraphAsync(validId.data, graph);
            useEditorStore.getState().setStatus('status.projectSaved');
        } catch (error) {
            useEditorStore.getState().setStatus(
                error instanceof ApiClientError ? 'api.saveFailed' : 'api.offlineMode',
            );
        }
    };

    const handleLoadServer = async (): Promise<void> => {
        const rawId = window.prompt(t('api.projectIdPrompt'), serverProjectId ?? '');
        if (rawId === null || rawId.trim() === '') {
            return;
        }
        const parsedId = UuidSchema.safeParse(rawId.trim());
        if (!parsedId.success) {
            useEditorStore.getState().setStatus('api.loadFailed');
            return;
        }
        try {
            const project = await apiClient.getProjectAsync(parsedId.data);
            useEditorStore.getState().setGraph(project.graph);
            useEditorStore.getState().setServerProjectId(project.id);
        } catch (error) {
            useEditorStore.getState().setStatus(
                error instanceof ApiClientError ? 'api.loadFailed' : 'api.offlineMode',
            );
        }
    };

    return (
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-700 bg-slate-900 px-4 py-3">
            <div className="mr-auto flex items-baseline gap-3">
                <h1 className="text-lg font-bold text-sky-300">{t('app.title')}</h1>
                <span className="hidden text-xs text-slate-500 md:inline">{t('app.subtitle')}</span>
                <input
                    type="text"
                    value={graph.name}
                    aria-label={t('app.projectName')}
                    onChange={(event) => useEditorStore.getState().setProjectName(event.target.value)}
                    className="ml-3 w-56 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
                {t('header.language')}
                <select
                    value={locale}
                    onChange={(event) => setLocale(event.target.value as Locale)}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                >
                    <option value="ru">RU</option>
                    <option value="en">EN</option>
                </select>
            </label>
            <div className="relative">
                <button
                    type="button"
                    aria-expanded={demoMenuOpen}
                    onClick={() => setDemoMenuOpen((open) => !open)}
                    className="rounded border border-indigo-600 px-3 py-2 text-sm font-medium text-indigo-300 hover:bg-indigo-950"
                >
                    {t('header.demoProjects')}
                </button>
                {demoMenuOpen && (
                    <div
                        role="menu"
                        className="absolute left-0 top-full z-20 mt-1 w-80 rounded border border-slate-600 bg-slate-900 p-2 shadow-xl"
                    >
                        {DEMO_PROJECTS.map((demo) => (
                            <button
                                key={demo.id}
                                type="button"
                                role="menuitem"
                                onClick={() => handleLoadDemo(demo.id)}
                                className="mb-1 block w-full rounded px-3 py-2 text-left hover:bg-slate-800"
                            >
                                <span className="block text-sm font-medium text-slate-100">
                                    {t(demo.nameKey as TranslationKey)}
                                </span>
                                <span className="block text-xs text-slate-400">
                                    {t(demo.descriptionKey as TranslationKey)}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <button
                type="button"
                disabled={!canUndo}
                title={t('header.undo')}
                onClick={() => useEditorStore.getState().undo()}
                className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
                {t('header.undoShort')}
            </button>
            <button
                type="button"
                disabled={!canRedo}
                title={t('header.redo')}
                onClick={() => useEditorStore.getState().redo()}
                className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
                {t('header.redoShort')}
            </button>
            <button
                type="button"
                onClick={() => useUiStore.getState().setGostPanelOpen(true)}
                className="rounded border border-teal-600 px-3 py-2 text-sm font-medium text-teal-300 hover:bg-teal-950"
            >
                {t('header.gostDocs')}
            </button>
            <input
                ref={fileRef}
                type="file"
                accept=".vwc,.json,application/json"
                className="hidden"
                onChange={(event) => void handleImport(event)}
            />
            <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
                {t('header.import')}
            </button>
            <button
                type="button"
                onClick={() => void handleExport()}
                className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
                {t('header.export')}
            </button>
            <button
                type="button"
                onClick={() => void handleSaveServer()}
                className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
                {t('header.saveServer')}
            </button>
            <button
                type="button"
                onClick={() => void handleLoadServer()}
                className="rounded border border-emerald-600 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-950"
            >
                {t('header.loadServer')}
            </button>
            <span className={`rounded px-2 py-1 text-xs ${desktop ? 'bg-amber-900/50 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                {desktop ? t('header.offline') : t('header.online')}
            </span>
            {desktop && (
                <>
                    <button
                        type="button"
                        onClick={() => void handleNativeSave()}
                        className="rounded border border-amber-600 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-950"
                    >
                        {t('header.saveNative')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleNativeOpen()}
                        className="rounded border border-amber-600 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-950"
                    >
                        {t('header.openNative')}
                    </button>
                </>
            )}
            <input
                ref={cadFileRef}
                type="file"
                accept=".dxf,.dwg"
                className="hidden"
                onChange={(event) => void handleCadImport(event)}
            />
            <button
                type="button"
                onClick={() => cadFileRef.current?.click()}
                className="rounded border border-cyan-600 px-3 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-950"
            >
                {t('header.importCad')}
            </button>
            <button
                type="button"
                onClick={() => void handleCalculate()}
                className="rounded border border-rose-600 px-3 py-2 text-sm font-medium text-rose-300 hover:bg-rose-950"
            >
                {t('header.calcShortCircuit')}
            </button>
            <button
                type="button"
                onClick={() => useUiStore.getState().setAiDrawerOpen(true)}
                className="rounded border border-violet-500 px-3 py-2 text-sm font-medium text-violet-300 hover:bg-violet-950"
            >
                {t('ai.open')}
            </button>
        </header>
    );
}
