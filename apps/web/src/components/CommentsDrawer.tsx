// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Панель замечаний и согласования проекта (заказчик / проектировщик). */
import { useState } from 'react';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { useAuthStore } from '../store/authStore.js';
import { useCommentsStore } from '../store/commentsStore.js';
import type { CommentFilter } from '../store/commentsStore.js';
import { useEditorStore } from '../store/editorStore.js';
import { useUiStore } from '../store/uiStore.js';

/**
 * Выдвижная панель комментариев с привязкой к текущей вкладке/узлу.
 * @returns React-элемент панели или null.
 */
export function CommentsDrawer() {
    const { t } = useI18n();
    const open = useCommentsStore((state) => state.drawerOpen);
    const comments = useCommentsStore((state) => state.comments);
    const filter = useCommentsStore((state) => state.filter);
    const setDrawerOpen = useCommentsStore((state) => state.setDrawerOpen);
    const setFilter = useCommentsStore((state) => state.setFilter);
    const addComment = useCommentsStore((state) => state.addComment);
    const resolveComment = useCommentsStore((state) => state.resolveComment);
    const reopenComment = useCommentsStore((state) => state.reopenComment);
    const activeView = useUiStore((state) => state.activeView);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const nodeLabel = useEditorStore((state) =>
        state.graph.nodes.find((item) => item.id === selectedNodeId)?.label ?? null,
    );
    const user = useAuthStore((state) => state.user);
    const [text, setText] = useState('');
    const canResolve = user === null || user.role !== 'client';

    if (!open) {
        return null;
    }

    const visible = filter === 'open' ? comments.filter((item) => item.status === 'open') : comments;
    const author = user?.name ?? t('auth.guest');

    /** Добавить замечание с привязкой к текущему контексту. */
    const handleAdd = (): void => {
        const trimmed = text.trim();
        if (trimmed === '') {
            return;
        }
        addComment(trimmed, activeView, selectedNodeId, author);
        setText('');
    };

    return (
        <aside className="flex w-80 shrink-0 flex-col border-l border-slate-700 bg-slate-900 p-3" aria-label={t('comments.title')}>
            <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-sky-300">{t('comments.title')}</h2>
                <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    aria-label={t('comments.close')}
                    className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                    {t('comments.close')}
                </button>
            </div>

            {user?.role === 'client' && (
                <p className="mb-2 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-400">
                    {t('comments.readOnly')}
                </p>
            )}

            <div className="mb-2 flex gap-1">
                {(['open', 'all'] as readonly CommentFilter[]).map((value) => (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={filter === value}
                        onClick={() => setFilter(value)}
                        className={`rounded px-2 py-1 text-[11px] ${
                            filter === value
                                ? 'bg-sky-900/60 text-sky-200'
                                : 'text-slate-400 hover:bg-slate-800'
                        }`}
                    >
                        {t(value === 'open' ? 'comments.filter.open' : 'comments.filter.all')}
                    </button>
                ))}
            </div>

            <div className="mb-3 flex-1 space-y-2 overflow-y-auto">
                {visible.length === 0 && (
                    <p className="text-xs text-slate-500">{t('comments.empty')}</p>
                )}
                {visible.map((comment) => (
                    <article key={comment.id} className="rounded border border-slate-700 bg-slate-800/50 p-2">
                        <p className="mb-1 text-[11px] text-slate-400">
                            {t('comments.author')}: {comment.author}
                        </p>
                        <p className="mb-1 text-xs text-slate-200">{comment.text}</p>
                        <p className="mb-1 text-[10px] text-slate-500">
                            {t(`tab.${comment.view}` as TranslationKey)}
                            {comment.nodeId !== null
                                ? ` · ${t('comments.attachedNode')}: ${comment.nodeId}`
                                : ''}
                        </p>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                            comment.status === 'resolved'
                                ? 'bg-emerald-900/60 text-emerald-300'
                                : 'bg-amber-900/60 text-amber-300'
                        }`}>
                            {t(comment.status === 'resolved' ? 'comments.resolved' : 'comments.openStatus')}
                        </span>
                        {canResolve && (
                            <button
                                type="button"
                                onClick={() => comment.status === 'open'
                                    ? resolveComment(comment.id)
                                    : reopenComment(comment.id)}
                                className="ml-2 rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                            >
                                {t(comment.status === 'open' ? 'comments.resolve' : 'comments.reopen')}
                            </button>
                        )}
                    </article>
                ))}
            </div>

            <label className="mb-2 block">
                <span className="mb-1 block text-xs text-slate-400">{t('comments.new')}</span>
                <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={t('comments.placeholder')}
                    rows={3}
                    className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100"
                />
            </label>
            <p className="mb-2 text-[10px] text-slate-500">
                {t('comments.attachedView')}: {t(`tab.${activeView}` as TranslationKey)}
                {nodeLabel !== null ? ` · ${t('comments.attachedNode')}: ${nodeLabel}` : ''}
            </p>
            <button
                type="button"
                disabled={text.trim() === ''}
                onClick={handleAdd}
                className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
                {t('comments.add')}
            </button>
        </aside>
    );
}
