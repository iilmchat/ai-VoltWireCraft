// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Модальное окно входа/регистрации; гостевой режим остаётся доступным. */
import { useState } from 'react';
import { useI18n } from '../i18n/index.js';
import { useAuthStore } from '../store/authStore.js';

/** Режим формы. */
type AuthMode = 'signIn' | 'signUp';

/**
 * Окно аутентификации.
 * @param props Признак открытия и обработчик закрытия.
 * @returns React-элемент окна или null.
 */
export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useI18n();
    const [mode, setMode] = useState<AuthMode>('signIn');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const busy = useAuthStore((state) => state.busy);
    const error = useAuthStore((state) => state.error);

    if (!open) {
        return null;
    }

    /** Отправить форму входа или регистрации. */
    const handleSubmit = async (): Promise<void> => {
        const store = useAuthStore.getState();
        store.clearError();
        const ok = mode === 'signIn'
            ? await store.signInAsync(email, password)
            : await store.signUpAsync(name, email, password);
        if (ok) {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
            <section role="dialog" aria-modal="true" aria-label={t('auth.signIn')} className="w-full max-w-sm rounded-lg border border-slate-600 bg-slate-900 p-5 shadow-2xl">
                <h2 className="mb-4 text-lg font-semibold text-sky-300">
                    {t(mode === 'signIn' ? 'auth.signIn' : 'auth.signUp')}
                </h2>
                <div className="mb-3 flex gap-1">
                    {(['signIn', 'signUp'] as const).map((value) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={mode === value}
                            onClick={() => setMode(value)}
                            className={`rounded px-2 py-1 text-xs ${
                                mode === value ? 'bg-sky-900/60 text-sky-200' : 'text-slate-400 hover:bg-slate-800'
                            }`}
                        >
                            {t(value === 'signIn' ? 'auth.signIn' : 'auth.signUp')}
                        </button>
                    ))}
                </div>
                {mode === 'signUp' && (
                    <label className="mb-3 block">
                        <span className="mb-1 block text-xs text-slate-400">{t('auth.name')}</span>
                        <input value={name} onChange={(event) => setName(event.target.value)}
                            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm" />
                    </label>
                )}
                <label className="mb-3 block">
                    <span className="mb-1 block text-xs text-slate-400">{t('auth.email')}</span>
                    <input type="email" value={email} onChange={(event) => setEmail(event.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm" />
                </label>
                <label className="mb-3 block">
                    <span className="mb-1 block text-xs text-slate-400">{t('auth.password')}</span>
                    <input type="password" value={password} onChange={(event) => setPassword(event.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm" />
                </label>
                {error !== null && <p role="alert" className="mb-2 text-xs text-rose-300">{error}</p>}
                <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => void handleSubmit()}
                        className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50">
                        {t(mode === 'signIn' ? 'auth.submitLogin' : 'auth.submitRegister')}
                    </button>
                    <button type="button" onClick={onClose}
                        className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                        {t('auth.guest')}
                    </button>
                    <button type="button" onClick={onClose}
                        className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">
                        {t('auth.close')}
                    </button>
                </div>
            </section>
        </div>
    );
}
