// © 2026 RuChating (iilmchat) · VoltWireCraft v0.5.0
import { UuidSchema } from '@voltwirecraft/shared/graph.schema.js';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useI18n } from '../i18n/index.js';
import type { Locale, TranslationKey } from '../i18n/index.js';
import { ApiClientError, apiClient } from '../lib/apiClient.js';
import { DEMO_PROJECTS, getDemoByGraphId } from '../lib/demoProjects.js';
import type { DemoProjectDefinition, DemoProjectId } from '../lib/demoProjects.js';
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
    const [cadImporting, setCadImporting] = useState(false);
    const [cadError, setCadError] = useState<string | null>(null);
    const canUndo = useEditorStore((state) => state.past.length > 0);
    const canRedo = useEditorStore((state) => state.future.length > 0);
    const activeDemo = getDemoByGraphId(graph.id);
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
        setCadError(null);
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
            setCadImporting(true);
            const result = await apiClient.importCadAsync(parsed.data, file);
            useEditorStore.getState().setGraph(result.graph);
            useEditorStore.getState().setStatus('status.dxfImported');
        } catch (error) {
            useEditorStore.getState().setStatus('cad.failed');
            const message = error instanceof ApiClientError ? error.message : t('cad.failed');
            const converterMissing =
                error instanceof ApiClientError && /ODA|converter|DWG|конвертер/i.test(message);
            setCadError(
                converterMissing
                    ? `${t('cad.converterMissing')} ${message}`
                    : `${t('cad.apiError')} ${message}`,
            );
        } finally {
            setCadImporting(false);
            event.target.value = '';
        }
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
                {activeDemo !== undefined && (
                    <span
                        title={t(activeDemo.nameKey as TranslationKey)}
                        className="rounded border border-sky-600 bg-sky-950/60 px-2 py-0.5 text-[11px] font-medium text-sky-300"
                    >
                        {activeDemo.supply === '400' ? t('template.phase3p') : t('template.phase1p')}
                        {' · '}
                        {activeDemo.powerKw} {t('template.kw')}
                    </span>
                )}
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
            <button
                type="button"
                aria-expanded={demoMenuOpen}
                onClick={() => setDemoMenuOpen(true)}
                className="rounded border border-indigo-600 px-3 py-2 text-sm font-medium text-indigo-300 hover:bg-indigo-950"
            >
                {t('header.demoProjects')}
            </button>
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
                disabled={cadImporting}
                onClick={() => cadFileRef.current?.click()}
                className="rounded border border-cyan-600 px-3 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-950 disabled:opacity-50"
            >
                {t('header.importCad')}
            </button>
            {cadImporting && (
                <span className="flex items-center gap-2 text-xs text-cyan-300" role="status" aria-live="polite">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-800 border-t-cyan-300" />
                    {t('cad.importing')}
                </span>
            )}
            {cadError !== null && (
                <div
                    role="alert"
                    className="w-full rounded border border-rose-600 bg-rose-950/60 px-3 py-2 text-xs text-rose-200"
                >
                    {cadError}
                    <button
                        type="button"
                        onClick={() => setCadError(null)}
                        aria-label={t('cad.dismiss')}
                        className="ml-3 rounded border border-rose-500 px-2 py-0.5 hover:bg-rose-900"
                    >
                        ×
                    </button>
                </div>
            )}
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

            {demoMenuOpen && (
                <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={t('template.title')}
                        className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 p-5 shadow-2xl"
                    >
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-sky-300">{t('template.title')}</h2>
                                <p className="mt-1 text-xs text-slate-400">{t('template.hint')}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDemoMenuOpen(false)}
                                aria-label={t('template.close')}
                                className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                            >
                                {t('template.close')}
                            </button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {DEMO_PROJECTS.map((demo: DemoProjectDefinition) => (
                                <button
                                    key={demo.id}
                                    type="button"
                                    onClick={() => handleLoadDemo(demo.id)}
                                    className={`flex h-full flex-col rounded border p-3 text-left transition-colors ${
                                        activeDemo?.id === demo.id
                                            ? 'border-sky-500 bg-sky-950/30'
                                            : 'border-slate-700 bg-slate-800/50 hover:border-indigo-500 hover:bg-slate-800'
                                    }`}
                                >
                                    <span className="mb-1 flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-slate-100">
                                            {t(demo.nameKey as TranslationKey)}
                                        </span>
                                        <span className="rounded bg-sky-900/70 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">
                                            {demo.supply === '400' ? t('template.phase3p') : t('template.phase1p')}
                                        </span>
                                    </span>
                                    <span className="mb-3 flex-1 text-xs text-slate-400">
                                        {t(demo.descriptionKey as TranslationKey)}
                                    </span>
                                    {demo.badgeKey !== undefined && (
                                        <span className="mb-2 inline-block w-fit rounded bg-indigo-900/60 px-1.5 py-0.5 text-[10px] font-medium text-indigo-200">
                                            {t(demo.badgeKey as TranslationKey)}
                                        </span>
                                    )}
                                    <span className="flex flex-wrap gap-1.5 text-[11px] text-slate-300">
                                        <span className="rounded bg-slate-700/60 px-1.5 py-0.5">
                                            {demo.supply} {t('template.volt')}
                                        </span>
                                        <span className="rounded bg-slate-700/60 px-1.5 py-0.5">
                                            {demo.powerKw} {t('template.kw')}
                                        </span>
                                        <span className="rounded bg-slate-700/60 px-1.5 py-0.5">
                                            {demo.groups} {t('template.groups')}
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}
