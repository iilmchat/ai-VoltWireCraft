// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useI18n } from '../i18n/index.js';
import type { Locale } from '../i18n/index.js';
import { downloadProjectAsync, parseProject } from '../lib/persistence.js';
import type { ImportErrorCode } from '../lib/persistence.js';
import { useEditorStore } from '../store/editorStore.js';

/**
 * Верхняя панель: название проекта, язык, импорт и экспорт `.vwc`.
 * @returns React-элемент шапки.
 */
export function Header() {
    const { t, locale, setLocale } = useI18n();
    const graph = useEditorStore((state) => state.graph);
    const fileRef = useRef<HTMLInputElement | null>(null);

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

    const handleExport = async (): Promise<void> => {
        const name = graph.name.replace(/[^\p{L}\p{N}._-]+/gu, '_');
        await downloadProjectAsync(graph, name.length > 0 ? name : 'project');
        useEditorStore.getState().setStatus('status.projectSaved');
    };

    return (
        <header className="flex shrink-0 items-center gap-4 border-b border-slate-700 bg-slate-900 px-4 py-3">
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
                className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
                {t('header.export')}
            </button>
        </header>
    );
}
