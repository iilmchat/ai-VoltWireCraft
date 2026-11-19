// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { useRef, useState } from 'react';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { loadBackgroundAsync } from '../lib/background.js';
import { useEditorStore } from '../store/editorStore.js';
import type { ToolId } from '../store/editorStore.js';
import { DevicePlacementTool } from './tools/DevicePlacementTool.js';

/** Доступные инструменты. */
const TOOLS: ToolId[] = ['select', 'scale', 'room', 'device', 'cable'];

/**
 * Левая панель с инструментами и загрузкой подложки.
 * @returns React-элемент панели.
 */
export function Palette() {
    const { t } = useI18n();
    const tool = useEditorStore((state) => state.tool);
    const statusKey = useEditorStore((state) => state.statusKey);
    const graph = useEditorStore((state) => state.graph);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [pageNumber, setPageNumber] = useState('1');
    const [loading, setLoading] = useState(false);

    const load = async (): Promise<void> => {
        const file = fileRef.current?.files?.[0];
        if (file === undefined) {
            return;
        }
        setLoading(true);
        try {
            const page = Math.max(1, Number(pageNumber) || 1);
            const loaded = await loadBackgroundAsync(file, page);
            useEditorStore.getState().setBackground(loaded.background, loaded.image);
        } catch {
            useEditorStore.getState().setStatus('palette.backgroundError');
        } finally {
            setLoading(false);
        }
    };

    return (
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                {t('palette.title')}
            </h2>
            <div className="flex flex-col gap-2">
                {TOOLS.map((id) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => useEditorStore.getState().setTool(id)}
                        className={`rounded px-3 py-2 text-left text-sm ${
                            tool === id
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                        }`}
                    >
                        {t(`tool.${id}` as TranslationKey)}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => {
                        const element = document.querySelector('[data-editor-container]');
                        const width = element instanceof HTMLElement ? element.clientWidth : 960;
                        const height = element instanceof HTMLElement ? element.clientHeight : 640;
                        useEditorStore.getState().fitView(width, height);
                    }}
                    className="mt-1 rounded border border-slate-600 px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
                >
                    {t('tool.resetView')}
                </button>
            </div>

            <div className="mt-5 border-t border-slate-700 pt-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-200">{t('palette.background')}</h3>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                    aria-label={t('palette.backgroundFile')}
                    className="mb-2 w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-slate-100"
                />
                <div className="mb-2 flex items-center gap-2">
                    <label className="text-xs text-slate-400" htmlFor="pdf-page">
                        {t('palette.page')}
                    </label>
                    <input
                        id="pdf-page"
                        type="number"
                        min="1"
                        value={pageNumber}
                        onChange={(event) => setPageNumber(event.target.value)}
                        className="w-16 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                    />
                </div>
                <button
                    type="button"
                    disabled={loading}
                    onClick={() => void load()}
                    className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                    {loading ? t('palette.loading') : t('palette.load')}
                </button>
                {graph.floorPlan.background !== null && (
                    <p className="mt-2 truncate text-xs text-slate-400">
                        {graph.floorPlan.background.name}
                        {graph.floorPlan.background.pageNumber !== null &&
                            ` · ${graph.floorPlan.background.pageNumber}`}
                    </p>
                )}
            </div>

            <DevicePlacementTool />

            <div className="mt-auto pt-4 text-xs text-slate-400">
                <span className="font-medium text-slate-300">{t('status.ready')}:</span>{' '}
                {t(statusKey)}
            </div>
        </aside>
    );
}
