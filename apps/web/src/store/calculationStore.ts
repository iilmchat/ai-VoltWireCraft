// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Состояние расчётов КЗ и селективности (DESIGN v0.3 § 3.3). */
import { UuidSchema } from '@voltwirecraft/shared/graph.schema.js';
import { create } from 'zustand';
import { apiClient } from '../lib/apiClient.js';
import type { ProjectShortCircuit } from '../lib/cadContracts.js';
import { useEditorStore } from './editorStore.js';

/** Состояние расчётов проекта. */
export interface CalculationState {
    /** Результат расчёта КЗ. */
    shortCircuit: ProjectShortCircuit | null;
    /** Признак выполнения расчёта. */
    loading: boolean;
    /** Сохранить результат расчёта. */
    setShortCircuit: (result: ProjectShortCircuit | null) => void;
    /** Запустить расчёт КЗ через API. */
    loadShortCircuitAsync: () => Promise<void>;
}

/** Хранилище результатов расчётов. */
export const useCalculationStore = create<CalculationState>((set, get) => ({
    shortCircuit: null,
    loading: false,

    setShortCircuit: (shortCircuit) => set({ shortCircuit }),

    loadShortCircuitAsync: async () => {
        if (get().loading) {
            return;
        }
        set({ loading: true });
        try {
            const rawId = useEditorStore.getState().serverProjectId;
            if (rawId === null) {
                useEditorStore.getState().setStatus('api.projectIdPrompt');
                return;
            }
            const parsed = UuidSchema.safeParse(rawId);
            if (!parsed.success) {
                useEditorStore.getState().setStatus('calc.failed');
                return;
            }
            const result = await apiClient.calculateShortCircuitAsync(parsed.data);
            set({ shortCircuit: result });
            useEditorStore.getState().setStatus('calc.done');
        } catch {
            useEditorStore.getState().setStatus('calc.failed');
        } finally {
            set({ loading: false });
        }
    },
}));
