// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
/** UI-состояние оболочки: вкладки, панель ИИ, результаты аудита и кэш каталога. */
import type { PueFinding } from '@voltwirecraft/shared/graph.schema.js';
import { create } from 'zustand';
import { listCatalogAsync } from '../lib/catalogClient.js';
import type { CatalogDevice } from '../lib/catalogClient.js';
import { useEditorStore } from './editorStore.js';

/** Время жизни кэша каталога, мс (5 минут). */
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

/** Идентификатор рабочего представления. */
export type WorkspaceView = 'plan' | 'panel' | 'panel3d' | 'singleLine' | 'bom' | 'grounding';

/** Действие ИИ-агента. */
export type AiAction = 'assemble' | 'audit' | 'chat';

/** Режим темы интерфейса. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Ключ localStorage для сохранённой темы. */
export const THEME_STORAGE_KEY = 'voltwirecraft.theme';

/** Прочитать сохранённую тему; при отсутствии — системная. */
function readStoredTheme(): ThemeMode {
    if (typeof window === 'undefined') {
        return 'system';
    }
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

/**
 * Применить тему к документу.
 * @param mode Режим темы.
 */
export function applyThemeMode(mode: ThemeMode): void {
    if (typeof document === 'undefined') {
        return;
    }
    document.documentElement.dataset['theme'] = mode;
}

/** Стартовая тема из localStorage. */
const initialThemeMode = readStoredTheme();

/** Состояние оболочки приложения. */
export interface UiState {
    /** Активная вкладка рабочей области. */
    activeView: WorkspaceView;
    /** Признак открытой панели «ИИ-Инженер». */
    aiDrawerOpen: boolean;
    /** Признак открытой формы выпуска комплекта РД по ГОСТ. */
    gostPanelOpen: boolean;
    /** Идентификатор активного щита в сессии UI (не часть графа, RULES § 5.2). */
    activePanelId: string | null;
    /** Режим темы Material 3 из брендбука IIRuChating. */
    themeMode: ThemeMode;
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
    /** Открыть/закрыть форму выпуска РД по ГОСТ. */
    setGostPanelOpen: (open: boolean) => void;
    /** Выбрать активный щит (только состояние сессии, граф не меняется). */
    setActivePanelId: (id: string | null) => void;
    /** Сменить тему и сохранить выбор в localStorage. */
    setThemeMode: (mode: ThemeMode) => void;
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
    gostPanelOpen: false,
    activePanelId: null,
    themeMode: initialThemeMode,
    auditIssues: [],
    busyAction: null,
    catalog: [],
    catalogLoading: false,
    catalogError: false,
    catalogUpdatedAt: null,

    setActiveView: (activeView) => set({ activeView }),
    setAiDrawerOpen: (aiDrawerOpen) => set({ aiDrawerOpen }),
    setGostPanelOpen: (gostPanelOpen) => set({ gostPanelOpen }),
    setActivePanelId: (activePanelId) => set({ activePanelId }),
    setThemeMode: (themeMode) => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
        }
        applyThemeMode(themeMode);
        set({ themeMode });
    },
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

// Тема применяется сразу при загрузке хранилища (до первого рендера).
applyThemeMode(initialThemeMode);
