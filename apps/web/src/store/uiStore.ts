// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** UI-состояние оболочки: вкладки, панель ИИ и результаты аудита. */
import type { PueFinding } from '@voltwirecraft/shared/graph.schema.js';
import { create } from 'zustand';
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
    /** Находки последнего аудита ПУЭ-7. */
    auditIssues: readonly PueFinding[];
    /** Выполняемое действие ИИ. */
    busyAction: AiAction | null;
    /** Выбрать вкладку. */
    setActiveView: (view: WorkspaceView) => void;
    /** Открыть/закрыть панель ИИ. */
    setAiDrawerOpen: (open: boolean) => void;
    /** Сохранить результаты аудита. */
    setAuditIssues: (issues: readonly PueFinding[]) => void;
    /** Отметить начало/конец действия ИИ. */
    setBusyAction: (action: AiAction | null) => void;
    /** Перейти к элементу из находки аудита. */
    focusIssue: (finding: PueFinding) => void;
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

    focusIssue: (finding) => {
        const editor = useEditorStore.getState();
        const firstNodeId = finding.nodeIds[0];
        if (firstNodeId !== undefined) {
            editor.selectNode(firstNodeId);
            set({ activeView: 'singleLine' });
            return;
        }
        set({ activeView: 'bom' });
    },
}));
