// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Личный кабинет «Мои проекты» с приглашением участников. */
import { useState } from 'react';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { useAuthStore } from '../store/authStore.js';
import type { CloudProject, InviteRole } from '../store/authStore.js';

/**
 * Кабинет облачных проектов.
 * @param props Признак открытия, закрытие и переход в проект.
 * @returns React-элемент кабинета или null.
 */
export function ProjectsDashboard({
    open,
    onClose,
    onOpenProject,
}: {
    open: boolean;
    onClose: () => void;
    onOpenProject?: (project: CloudProject) => void;
}) {
    const { t } = useI18n();
    const user = useAuthStore((state) => state.user);
    const projects = useAuthStore((state) => state.projects);
    const busy = useAuthStore((state) => state.busy);
    const [newName, setNewName] = useState('');
    const [shareProject, setShareProject] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<InviteRole>('engineer');

    if (!open) {
        return null;
    }

    /** Создать облачный проект. */
    const handleCreate = async (): Promise<void> => {
        if (newName.trim() === '') {
            return;
        }
        await useAuthStore.getState().createProjectAsync(newName.trim());
        setNewName('');
    };

    /** Пригласить участника в проект. */
    const handleInvite = async (): Promise<void> => {
        if (shareProject === null) {
            return;
        }
        const ok = await useAuthStore.getState().inviteAsync(shareProject, email, role);
        if (ok) {
            setShareProject(null);
            setEmail('');
        }
    };

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4">
            <section role="dialog" aria-modal="true" aria-label={t('dashboard.title')} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 p-5 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-sky-300">{t('dashboard.title')}</h2>
                        <p className="text-xs text-slate-400">{t('dashboard.subtitle')}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">
                        {t('auth.close')}
                    </button>
                </div>

                {user === null && (
                    <p className="mb-4 rounded bg-slate-800 px-3 py-2 text-xs text-slate-400">{t('auth.guest')}</p>
                )}

                <div className="mb-4 flex gap-2">
                    <input value={newName} onChange={(event) => setNewName(event.target.value)}
                        placeholder={t('dashboard.projectName')}
                        className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm" />
                    <button type="button" disabled={busy || newName.trim() === ''} onClick={() => void handleCreate()}
                        className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50">
                        {t('dashboard.newProject')}
                    </button>
                </div>

                {projects.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500">{t('dashboard.empty')}</p>
                ) : (
                    <ul className="space-y-2">
                        {projects.map((project) => (
                            <li key={project.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-700 bg-slate-800/50 px-3 py-2">
                                <span className="flex-1 text-sm text-slate-100">{project.name}</span>
                                <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                                    {t(`auth.role.${project.role}` as TranslationKey)}
                                </span>
                                <button type="button" onClick={() => setShareProject(project.id)}
                                    className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700">
                                    {t('dashboard.share')}
                                </button>
                                {onOpenProject !== undefined && (
                                    <button type="button" onClick={() => onOpenProject(project)}
                                        className="rounded border border-sky-600 px-2 py-1 text-[11px] text-sky-300 hover:bg-sky-950">
                                        {t('dashboard.open')}
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {shareProject !== null && (
                    <div className="mt-4 rounded border border-indigo-600 bg-slate-800/60 p-3">
                        <h3 className="mb-2 text-xs font-semibold text-indigo-300">{t('dashboard.share')}</h3>
                        <div className="flex flex-wrap gap-2">
                            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)}
                                placeholder={t('dashboard.inviteEmail')}
                                className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm" />
                            <select value={role} onChange={(event) => setRole(event.target.value as InviteRole)}
                                aria-label={t('dashboard.inviteRole')}
                                className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm">
                                <option value="engineer">{t('auth.role.engineer')}</option>
                                <option value="client">{t('auth.role.client')}</option>
                            </select>
                            <button type="button" disabled={busy || email === ''} onClick={() => void handleInvite()}
                                className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                                {t('dashboard.invite')}
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
