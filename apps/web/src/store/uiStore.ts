// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** UI-состояние оболочки: вкладки, панель ИИ, результаты аудита и кэш каталога. */
import type { PueFinding } from '@voltwirecraft/shared/graph.schema.js';
import { create } from 'zustand';
import { listCatalogAsync } from '../lib/catalogClient.js';
import type { CatalogDevice } from '../lib/catalogClient.js';
import { useEditorStore } from './editorStore.js';

/** Время жизни кэша каталога, мс (5 минут). */
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

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
    /** Кэш позиций каталога с актуальными ценами (KI-004). */
    catalog: readonly CatalogDevice[];
    /** Идёт ли загрузка/обновление каталога. */
    catalogLoading: boolean;
    /** Признак неудачной попытки обновить каталог (используется офлайн-запас). */
    catalogError: boolean;
    /** Время последнего успешного обновления каталога, мс с эпохи; `null`, если его не было. */
    catalogUpdatedAt: number | null;
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
    /**
     * Загрузить каталог в кэш. Повторный запрос выполняется только при пустом
     * кэше, при `force === true` или когда кэш старше 5 минут.
     * При ошибке предыдущий каталог сохраняется (офлайн-запас).
     */
    loadCatalogAsync: (force?: boolean) => Promise<void>;
    /** Сбросить кэш каталога (следующая загрузка будет принудительной). */
    clearCatalog: () => void;
}

/** Хранилище UI-состояния. */
export const useUiStore = create<UiState>((set, get) => ({
    activeView: 'plan',
    aiDrawerOpen: false,
    auditIssues: [],
    busyAction: null,
    catalog: [],
    catalogLoading: false,
    catalogError: false,
    catalogUpdatedAt: null,

    setActiveView: (activeView) => set({ activeView }),
    setAiDrawerOpen: (aiDrawerOpen) => set({ aiDrawerOpen }),
    setAuditIssues: (auditIssues) => set({ auditIssues }),
    setBusyAction: (busyAction) => set({ busyAction }),

    loadCatalogAsync: async (force = false) => {
        const state = get();
        if (state.catalogLoading && !force) {
            return;
        }
        const now = Date.now();
        const updatedAt = state.catalogUpdatedAt;
        const isExpired = updatedAt === null || now - updatedAt > CATALOG_CACHE_TTL_MS;
        if (!force && state.catalog.length > 0 && !isExpired) {
            return;
        }

        set({ catalogLoading: true });
        try {
            const list = await listCatalogAsync();
            set({
                catalog: list.items,
                catalogError: false,
                catalogLoading: false,
                catalogUpdatedAt: Date.now(),
            });
        } catch {
            // Офлайн-запас: сохраняем ранее загруженный каталог и помечаем ошибку.
            set({ catalogError: true, catalogLoading: false });
        }
    },

    clearCatalog: () => set({ catalog: [], catalogError: false, catalogUpdatedAt: null }),

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
