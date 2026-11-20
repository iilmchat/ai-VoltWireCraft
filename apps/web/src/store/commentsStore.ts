// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/**
 * Сессионный журнал замечаний проектировщика и заказчика.
 * Комментарии не меняют канонический граф (RULES § 5.2).
 */
import { create } from 'zustand';
import type { WorkspaceView } from './uiStore.js';

/** Статус замечания. */
export type CommentStatus = 'open' | 'resolved';

/** Замечание по проекту. */
export interface ProjectComment {
    /** Идентификатор записи. */
    readonly id: string;
    /** Автор (имя пользователя или «Гость»). */
    readonly author: string;
    /** Текст замечания. */
    readonly text: string;
    /** Вкладка, к которой привязано замечание. */
    readonly view: WorkspaceView;
    /** Идентификатор узла графа или `null`. */
    readonly nodeId: string | null;
    /** Статус согласования. */
    readonly status: CommentStatus;
    /** ISO-дата создания. */
    readonly createdAt: string;
}

/** Фильтр списка замечаний. */
export type CommentFilter = 'open' | 'all';

/** Состояние журнала замечаний. */
export interface CommentsState {
    /** Все замечания проекта. */
    comments: readonly ProjectComment[];
    /** Текущий фильтр. */
    filter: CommentFilter;
    /** Признак открытой панели. */
    drawerOpen: boolean;
    /** Добавить замечание. */
    addComment: (text: string, view: WorkspaceView, nodeId: string | null, author: string) => void;
    /** Отметить замечание решённым. */
    resolveComment: (id: string) => void;
    /** Вернуть замечание в работу. */
    reopenComment: (id: string) => void;
    /** Изменить фильтр. */
    setFilter: (filter: CommentFilter) => void;
    /** Открыть/закрыть панель. */
    setDrawerOpen: (open: boolean) => void;
}

/**
 * Хранилище замечаний проекта.
 * @returns Zustand-стор с пустым журналом.
 */
export const useCommentsStore = create<CommentsState>((set) => ({
    comments: [],
    filter: 'open',
    drawerOpen: false,
    addComment: (text, view, nodeId, author) => set((state) => ({
        comments: [
            ...state.comments,
            {
                id: crypto.randomUUID(),
                author,
                text,
                view,
                nodeId,
                status: 'open',
                createdAt: new Date().toISOString(),
            },
        ],
    })),
    resolveComment: (id) => set((state) => ({
        comments: state.comments.map((comment) =>
            comment.id === id ? { ...comment, status: 'resolved' } : comment),
    })),
    reopenComment: (id) => set((state) => ({
        comments: state.comments.map((comment) =>
            comment.id === id ? { ...comment, status: 'open' } : comment),
    })),
    setFilter: (filter) => set({ filter }),
    setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
}));
