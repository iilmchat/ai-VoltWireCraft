// © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
/**
 * Правая выдвижная панель «ИИ-Инженер»: чат с копилотом, сборка щита и аудит ПУЭ-7.
 * RULES § 5.1: агент не считает физику, только предлагает изменения графа.
 * RULES § 5.4: при недоступности сервера используется детерминированный локальный proposal.
 */
import { useEffect, useRef, useState } from 'react';
import { UuidSchema } from '@voltwirecraft/shared/graph.schema.js';
import type { PueFinding } from '@voltwirecraft/shared/graph.schema.js';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { createLocalProposal } from '../lib/aiChatLocal.js';
import type { CopilotChatResponse } from '../lib/aiContracts.js';
import { ApiClientError, apiClient } from '../lib/apiClient.js';
import { useEditorStore } from '../store/editorStore.js';
import { useUiStore } from '../store/uiStore.js';

/**
 * Привести ключ строки чата к типу ключей переводов.
 * Словари пополняются новыми ключами чата параллельно с этим компонентом,
 * поэтому мост сохраняет работоспособность на переходном этапе.
 * @param key — точный ключ строки чата.
 * @returns ключ переводов.
 */
function chatKey(key: string): TranslationKey {
    return key as TranslationKey;
}

/** Сообщение чата в локальном состоянии текущей сессии. */
interface ChatMessage {
    /** Идентификатор сообщения. */
    readonly id: string;
    /** Роль отправителя. */
    readonly role: 'user' | 'assistant';
    /** Текст сообщения. */
    readonly content: string;
}

/** Быстрая команда копилоту. */
interface QuickCommand {
    /** Ключ подписи кнопки. */
    readonly key: TranslationKey;
    /** Команда, отправляемая по клику. */
    readonly command: string;
}

/** Подсказки чата. */
const QUICK_COMMANDS: readonly QuickCommand[] = [
    { key: chatKey('ai.quick.master'), command: 'Добавить мастер-выключатель' },
    { key: chatKey('ai.quick.oven'), command: 'Выделить духовой шкаф на отдельную линию' },
    { key: chatKey('ai.quick.keaz'), command: 'Перейти на КЭАЗ' },
];

/**
 * Панель ИИ-инженера: чат, автосборка щита и аудит ПУЭ-7.
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

    const [messages, setMessages] = useState<readonly ChatMessage[]>(() => [
        { id: 'welcome', role: 'assistant', content: t(chatKey('ai.chat.welcome')) },
    ]);
    const [draft, setDraft] = useState('');
    const [proposal, setProposal] = useState<CopilotChatResponse | null>(null);
    const [noticeKey, setNoticeKey] = useState<TranslationKey | null>(null);
    const feedRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const feed = feedRef.current;
        if (feed !== null) {
            feed.scrollTop = feed.scrollHeight;
        }
    }, [messages, busyAction, proposal, noticeKey]);

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
            setAuditIssues(result.findings);
            useEditorStore.getState().setStatus('ai.auditDone');
        } catch {
            useEditorStore.getState().setStatus('ai.failed');
        } finally {
            setBusyAction(null);
        }
    };

    const handleIssueClick = (finding: PueFinding): void => {
        focusIssue(finding);
        setAiDrawerOpen(false);
    };

    /**
     * Отправить сообщение копилоту: сервер, при ошибке сети — локальный proposal.
     * @param text — текст команды пользователя.
     */
    const sendMessageAsync = async (text: string): Promise<void> => {
        const content = text.trim();
        if (content.length === 0 || busyAction !== null) {
            return;
        }

        setMessages((previous) => [
            ...previous,
            { id: crypto.randomUUID(), role: 'user', content },
        ]);
        setDraft('');
        setProposal(null);
        setNoticeKey(null);
        setBusyAction('chat');

        try {
            let response: CopilotChatResponse;
            let offline = false;
            try {
                const rawId = await resolveProjectIdAsync();
                const parsed = UuidSchema.safeParse(rawId);
                if (!parsed.success) {
                    throw new ApiClientError('invalid project id', 400);
                }
                response = await apiClient.chatAsync(parsed.data, {
                    message: content,
                    history: messages.slice(-20).map((message) => ({
                        role: message.role,
                        content: message.content,
                    })),
                });
            } catch {
                // RULES § 5.4: сервер недоступен — строим детерминированное предложение локально.
                offline = true;
                response = createLocalProposal(graph, content);
            }

            setMessages((previous) => [
                ...previous,
                { id: crypto.randomUUID(), role: 'assistant', content: response.reply },
            ]);
            if (offline) {
                setNoticeKey(chatKey('ai.chat.offline'));
            }
            if (response.proposedGraph !== undefined) {
                setProposal(response);
            }
        } catch {
            setNoticeKey(chatKey('ai.chat.failed'));
            useEditorStore.getState().setStatus(chatKey('ai.chat.failed'));
        } finally {
            setBusyAction(null);
        }
    };

    /** Применить ожидающее предложение через хранилище редактора (Undo + статус). */
    const handleApplyProposal = (): void => {
        if (proposal === null || proposal.proposedGraph === undefined) {
            return;
        }
        useEditorStore.getState().applyProposedGraph(proposal.proposedGraph);
        setMessages((previous) => [
            ...previous,
            {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: t(chatKey('ai.chat.applied')),
            },
        ]);
        setProposal(null);
    };

    /** Отклонить ожидающее предложение. */
    const handleRejectProposal = (): void => {
        setProposal(null);
        setMessages((previous) => [
            ...previous,
            {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: t(chatKey('ai.chat.rejected')),
            },
        ]);
    };

    return (
        <aside className="flex w-96 shrink-0 flex-col border-l border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
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

            <div className="border-b border-slate-700 px-4 pb-3">
                <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                    {t(chatKey('ai.chat.hintQuick'))}
                </p>
                <div className="flex flex-wrap gap-2">
                    {QUICK_COMMANDS.map((quick) => (
                        <button
                            key={quick.key}
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => void sendMessageAsync(quick.command)}
                            className="rounded-full border border-sky-700 bg-sky-950/40 px-3 py-1 text-[11px] text-sky-200 hover:bg-sky-900 disabled:opacity-50"
                        >
                            {t(quick.key)}
                        </button>
                    ))}
                </div>
            </div>

            <div ref={feedRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`flex flex-col ${
                            message.role === 'user' ? 'items-end' : 'items-start'
                        }`}
                    >
                        <span className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                            {t(message.role === 'user'
                                ? chatKey('ai.role.user')
                                : chatKey('ai.role.assistant'))}
                        </span>
                        <div
                            className={`max-w-[92%] whitespace-pre-line rounded px-3 py-2 text-xs ${
                                message.role === 'user'
                                    ? 'bg-sky-700 text-white'
                                    : 'bg-slate-800 text-slate-200'
                            }`}
                        >
                            {message.content}
                        </div>
                    </div>
                ))}

                {busyAction === 'chat' && (
                    <p className="text-xs italic text-slate-400">{t(chatKey('ai.chat.thinking'))}</p>
                )}

                {noticeKey !== null && (
                    <p
                        className={`rounded px-3 py-2 text-xs ${
                            noticeKey === chatKey('ai.chat.offline')
                                ? 'bg-amber-950/50 text-amber-200'
                                : 'bg-rose-950/50 text-rose-200'
                        }`}
                    >
                        {t(noticeKey)}
                    </p>
                )}

                {proposal !== null && proposal.proposedGraph !== undefined && (
                    <div className="rounded border border-sky-600 bg-sky-950/40 p-3">
                        <h4 className="mb-2 text-xs font-semibold text-sky-200">
                            {t(chatKey('ai.chat.proposed'))}
                        </h4>
                        <ul className="mb-3 space-y-1 text-[11px] text-slate-200">
                            {proposal.diffSummary.map((line, index) => (
                                <li key={`${index}-${line}`} className="flex gap-1">
                                    <span aria-hidden="true">•</span>
                                    <span>{line}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleApplyProposal}
                                disabled={busyAction !== null}
                                className="rounded bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                            >
                                {t(chatKey('ai.chat.apply'))}
                            </button>
                            <button
                                type="button"
                                onClick={handleRejectProposal}
                                disabled={busyAction !== null}
                                className="rounded border border-slate-500 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                            >
                                {t(chatKey('ai.chat.reject'))}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="border-t border-slate-700 px-4 py-3">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void sendMessageAsync(draft);
                            }
                        }}
                        placeholder={t(chatKey('ai.chat.placeholder'))}
                        disabled={busyAction !== null}
                        className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none disabled:opacity-50"
                    />
                    <button
                        type="button"
                        onClick={() => void sendMessageAsync(draft)}
                        disabled={busyAction !== null || draft.trim().length === 0}
                        className="rounded bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                        {t(chatKey('ai.chat.send'))}
                    </button>
                </div>
            </div>

            <div className="max-h-72 overflow-y-auto border-t border-slate-700 px-4 py-3">
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">
                    {t(chatKey('ai.tools.title'))}
                </h3>
                <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void handleAssemble()}
                    className="mb-2 w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                >
                    {t('ai.assemble')}
                </button>
                <p className="mb-3 text-xs text-slate-500">{t('ai.assembleHint')}</p>

                <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void handleAudit()}
                    className="mb-2 w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                    {t('ai.audit')}
                </button>
                <p className="mb-3 text-xs text-slate-500">{t('ai.auditHint')}</p>

                {(busyAction === 'assemble' || busyAction === 'audit') && (
                    <p className="mb-3 rounded bg-slate-800 px-3 py-2 text-xs text-slate-300">
                        {t('ai.working')}
                    </p>
                )}

                <h4 className="mb-2 text-xs font-semibold uppercase text-slate-400">{t('ai.audit')}</h4>
                <div className="space-y-2">
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
                            <div className="mt-1 text-[10px] opacity-70">
                                {issue.ruleId} · {issue.section}
                            </div>
                            <div className="mt-1 text-[10px] opacity-60">{issue.recommendation}</div>
                        </button>
                    ))}
                </div>
            </div>
        </aside>
    );
}
