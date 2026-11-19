// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Правая выдвижная панель «ИИ-Инженер» (RULES § 5.1: агент не считает физику). */
import { UuidSchema } from '@voltwirecraft/shared/graph.schema.js';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { ApiClientError, apiClient } from '../lib/apiClient.js';
import type { AiAuditIssue } from '../lib/aiContracts.js';
import { useEditorStore } from '../store/editorStore.js';
import { useUiStore } from '../store/uiStore.js';

/**
 * Панель ИИ-инженера: автосборка щита и аудит ПУЭ-7.
 * @returns React-элемент панели или null.
 */
export function AiAssistantDrawer() {
    const { t } = useI18n();
    const open = useUiStore((state) => state.aiDrawerOpen);
    const issues = useUiStore((state) => state.auditIssues);
    const busyAction = useUiStore((state) => state.busyAction);
    const setAiDrawerOpen = useUiStore((state) => state.setAiDrawerOpen);
    const setAuditIssues = useUiStore((state) => state.setAuditIssues);
    const setBusyAction = useUiStore((state) => state.setBusyAction);
    const focusIssue = useUiStore((state) => state.focusIssue);
    const serverProjectId = useEditorStore((state) => state.serverProjectId);
    const graph = useEditorStore((state) => state.graph);

    if (!open) {
        return null;
    }

    /** Получить идентификатор серверного проекта, создав проект при необходимости. */
    const resolveProjectIdAsync = async (): Promise<string> => {
        const existing = serverProjectId;
        if (existing !== null) {
            return existing;
        }
        const project = await apiClient.createProjectAsync({
            title: graph.name,
            objectType: 'house',
            networkSystem: 'tn-c-s',
        });
        useEditorStore.getState().setServerProjectId(project.id);
        return project.id;
    };

    const handleAssemble = async (): Promise<void> => {
        setBusyAction('assemble');
        try {
            const rawId = await resolveProjectIdAsync();
            const parsed = UuidSchema.safeParse(rawId);
            if (!parsed.success) {
                throw new ApiClientError('invalid project id', 400);
            }
            const result = await apiClient.assemblePanelAsync(parsed.data);
            useEditorStore.getState().setGraph(result.graph);
            useEditorStore.getState().setStatus('ai.assembleDone');
            useUiStore.getState().setActiveView('panel');
        } catch {
            useEditorStore.getState().setStatus('ai.failed');
        } finally {
            setBusyAction(null);
        }
    };

    const handleAudit = async (): Promise<void> => {
        setBusyAction('audit');
        try {
            const rawId = await resolveProjectIdAsync();
            const parsed = UuidSchema.safeParse(rawId);
            if (!parsed.success) {
                throw new ApiClientError('invalid project id', 400);
            }
            const result = await apiClient.auditPueAsync(parsed.data);
            setAuditIssues(result.issues);
            useEditorStore.getState().setStatus('ai.auditDone');
        } catch {
            useEditorStore.getState().setStatus('ai.failed');
        } finally {
            setBusyAction(null);
        }
    };

    const handleIssueClick = (issue: AiAuditIssue): void => {
        focusIssue(issue);
        setAiDrawerOpen(false);
    };

    return (
        <aside className="flex w-96 shrink-0 flex-col border-l border-slate-700 bg-slate-900 p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-300">
                    {t('ai.title')}
                </h2>
                <button
                    type="button"
                    onClick={() => setAiDrawerOpen(false)}
                    className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                    {t('ai.close')}
                </button>
            </div>

            <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleAssemble()}
                className="mb-2 w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
                {t('ai.assemble')}
            </button>
            <p className="mb-4 text-xs text-slate-500">{t('ai.assembleHint')}</p>

            <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleAudit()}
                className="mb-2 w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
                {t('ai.audit')}
            </button>
            <p className="mb-4 text-xs text-slate-500">{t('ai.auditHint')}</p>

            {busyAction !== null && (
                <p className="mb-3 rounded bg-slate-800 px-3 py-2 text-xs text-slate-300">
                    {t('ai.working')}
                </p>
            )}

            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">{t('ai.audit')}</h3>
            <div className="flex-1 space-y-2 overflow-y-auto">
                {issues.length === 0 && <p className="text-xs text-slate-500">{t('ai.noIssues')}</p>}
                {issues.map((issue) => (
                    <button
                        key={issue.id}
                        type="button"
                        onClick={() => handleIssueClick(issue)}
                        className={`w-full rounded border px-3 py-2 text-left text-xs ${
                            issue.severity === 'error'
                                ? 'border-rose-600 bg-rose-950/40 text-rose-200'
                                : issue.severity === 'warning'
                                    ? 'border-amber-600 bg-amber-950/40 text-amber-200'
                                    : 'border-slate-600 bg-slate-800 text-slate-200'
                        }`}
                    >
                        <div className="mb-1 font-medium">
                            {t(`ai.severity.${issue.severity}` as TranslationKey)}
                        </div>
                        <div>{issue.message}</div>
                        {issue.citation !== null && issue.citation !== undefined && (
                            <div className="mt-1 text-[10px] opacity-70">{issue.citation}</div>
                        )}
                    </button>
                ))}
            </div>
        </aside>
    );
}
