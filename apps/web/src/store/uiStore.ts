// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** UI-состояние оболочки: вкладки, панель ИИ и результаты аудита. */
import { create } from 'zustand';
import type { AiAuditIssue } from '../lib/aiContracts.js';
import { useEditorStore } from './editorStore.js';

/** Идентификатор рабочего представления. */
export type WorkspaceView = 'plan' | 'panel' | 'singleLine' | 'bom';

/** Действие ИИ-агента. */
export type AiAction = 'assemble' | 'audit';

/** Состояние оболочки приложения. */
export interface UiState {
    /** Активная вкладка рабочей области. */
    activeView: WorkspaceView;
    /** Признак открытой панели «ИИ-Инженер». */
    aiDrawerOpen: boolean;
    /** Замечания последнего аудита. */
    auditIssues: readonly AiAuditIssue[];
    /** Выполняемое действие ИИ. */
    busyAction: AiAction | null;
    /** Выбрать вкладку. */
    setActiveView: (view: WorkspaceView) => void;
    /** Открыть/закрыть панель ИИ. */
    setAiDrawerOpen: (open: boolean) => void;
    /** Сохранить результаты аудита. */
    setAuditIssues: (issues: readonly AiAuditIssue[]) => void;
    /** Отметить начало/конец действия ИИ. */
    setBusyAction: (action: AiAction | null) => void;
    /** Перейти к элементу из замечания аудита. */
    focusIssue: (issue: AiAuditIssue) => void;
}

/** Хранилище UI-состояния. */
export const useUiStore = create<UiState>((set) => ({
    activeView: 'plan',
    aiDrawerOpen: false,
    auditIssues: [],
    busyAction: null,

    setActiveView: (activeView) => set({ activeView }),
    setAiDrawerOpen: (aiDrawerOpen) => set({ aiDrawerOpen }),
    setAuditIssues: (auditIssues) => set({ auditIssues }),
    setBusyAction: (busyAction) => set({ busyAction }),

    focusIssue: (issue) => {
        const editor = useEditorStore.getState();
        if (issue.nodeId !== null && issue.nodeId !== undefined) {
            editor.selectNode(issue.nodeId);
            set({ activeView: 'singleLine' });
            return;
        }
        if (issue.edgeId !== null && issue.edgeId !== undefined) {
            editor.selectEdge(issue.edgeId);
            set({ activeView: 'singleLine' });
            return;
        }
        set({ activeView: 'bom' });
    },
}));
