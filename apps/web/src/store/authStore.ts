// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/**
 * Клиентское хранилище авторизации, ролей и облачных проектов.
 *
 * Гостевой режим обязателен (RULES § 5.4): отсутствие пользователя не блокирует
 * редактор и не требует регистрации. Локальный демо-транспорт детерминирован,
 * не обращается к сети и работает в Tauri. Пароль лишь проверяется на непустоту
 * и никогда не сохраняется. Реальный backend (`AuthModule`) подключается через
 * {@link setAuthTransport}, не меняя действия хранилища.
 */
import { create } from 'zustand';

/** Роль пользователя в проекте (RULES § 2.1, § 3.4). */
export type UserRole = 'owner' | 'engineer' | 'client';

/** Роль приглашённого участника: владелец назначается созданием проекта. */
export type InviteRole = Extract<UserRole, 'engineer' | 'client'>;

/** Аутентифицированный пользователь (только несекретные демо-данные). */
export interface AuthUser {
    /** Идентификатор пользователя. */
    readonly id: string;
    /** Отображаемое имя. */
    readonly name: string;
    /** Email (демо, не используется для отправки писем). */
    readonly email: string;
    /** Роль в текущем проекте. */
    readonly role: UserRole;
}

/** Облачный проект демо-кабинета. */
export interface CloudProject {
    /** Идентификатор проекта. */
    readonly id: string;
    /** Название проекта. */
    readonly name: string;
    /** Роль текущего пользователя в проекте. */
    readonly role: UserRole;
    /** ISO-дата последнего обновления (фиксированная в демо). */
    readonly updatedAt: string;
}

/** Приглашение участника в проект. */
export interface ProjectInvite {
    /** Идентификатор проекта. */
    readonly projectId: string;
    /** Email приглашённого. */
    readonly email: string;
    /** Роль приглашённого engineer/client. */
    readonly role: InviteRole;
}

/**
 * Транспорт авторизации. Реальный API реализует этот контракт и подменяет
 * демо-реализацию через {@link setAuthTransport}.
 */
export interface AuthTransport {
    /** Войти по email и паролю. */
    signInAsync: (email: string, password: string) => Promise<AuthUser>;
    /** Создать аккаунт с ролью владельца. */
    signUpAsync: (name: string, email: string, password: string) => Promise<AuthUser>;
    /** Создать облачный проект с ролью владельца. */
    createProjectAsync: (name: string) => Promise<CloudProject>;
    /** Пригласить участника; `false` при неверном email или роли. */
    inviteAsync: (invite: ProjectInvite) => Promise<boolean>;
}

/** Состояние, сохраняемое в localStorage. */
export interface PersistedAuthState {
    /** Текущий пользователь или `null` для гостя. */
    readonly user: AuthUser | null;
    /** Облачные проекты. */
    readonly projects: readonly CloudProject[];
    /** Приглашения участников. */
    readonly invites: readonly ProjectInvite[];
}

/** Ключ localStorage в пространстве имён демо-авторизации (без секретов). */
export const AUTH_STORAGE_KEY = 'voltwirecraft.auth.demo';

/** Фиксированная ISO-дата демо-проектов (детерминированные результаты). */
export const DEMO_UPDATED_AT = '2026-11-20T00:00:00.000Z';

/** Проверить, что пользователь не аутентифицирован (RULES § 5.4). */
export function isGuestUser(user: AuthUser | null): boolean {
    return user === null;
}

/** Селектор гостевого режима для использования с `useAuthStore`. */
export const selectIsGuest = (state: Pick<AuthState, 'user'>): boolean => isGuestUser(state.user);

/** Проверка, что значение — объект. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/** Проверка роли пользователя. */
function isUserRole(value: unknown): value is UserRole {
    return value === 'owner' || value === 'engineer' || value === 'client';
}

/** Проверка роли приглашения. */
function isInviteRole(value: unknown): value is InviteRole {
    return value === 'engineer' || value === 'client';
}

/** Безопасное восстановление пользователя из localStorage. */
function parseAuthUser(value: unknown): AuthUser | null {
    if (!isRecord(value)) {
        return null;
    }
    const { id, name, email, role } = value;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof email !== 'string' || !isUserRole(role)) {
        return null;
    }
    return { id, name, email, role };
}

/** Безопасное восстановление проекта из localStorage. */
function parseCloudProject(value: unknown): CloudProject | null {
    if (!isRecord(value)) {
        return null;
    }
    const { id, name, role, updatedAt } = value;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof updatedAt !== 'string' || !isUserRole(role)) {
        return null;
    }
    return { id, name, role, updatedAt };
}

/** Безопасное восстановление приглашения из localStorage. */
function parseProjectInvite(value: unknown): ProjectInvite | null {
    if (!isRecord(value)) {
        return null;
    }
    const { projectId, email, role } = value;
    if (typeof projectId !== 'string' || typeof email !== 'string' || !isInviteRole(role)) {
        return null;
    }
    return { projectId, email, role };
}

/**
 * Прочитать демо-состояние из localStorage.
 * При отсутствии window, повреждённом или некорректном JSON возвращается пустое состояние.
 */
export function loadPersistedAuthState(): PersistedAuthState {
    const empty: PersistedAuthState = { user: null, projects: [], invites: [] };
    if (typeof window === 'undefined') {
        return empty;
    }
    try {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw === null) {
            return empty;
        }
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) {
            return empty;
        }
        const userValue = parsed['user'];
        const projectsValue = parsed['projects'];
        const invitesValue = parsed['invites'];
        const projects = Array.isArray(projectsValue)
            ? projectsValue
                .map(parseCloudProject)
                .filter((project): project is CloudProject => project !== null)
            : [];
        const invites = Array.isArray(invitesValue)
            ? invitesValue
                .map(parseProjectInvite)
                .filter((invite): invite is ProjectInvite => invite !== null)
            : [];
        return {
            user: userValue === undefined ? null : parseAuthUser(userValue),
            projects,
            invites,
        };
    } catch {
        // Офлайн-хранилище может быть недоступно: состояние остаётся в памяти.
        return empty;
    }
}

/** Сохранить демо-состояние в localStorage (только несекретные данные). */
function persistAuthState(state: Pick<AuthState, 'user' | 'projects' | 'invites'>): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        const payload: PersistedAuthState = {
            user: state.user,
            projects: state.projects,
            invites: state.invites,
        };
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // Квота или приватный режим: продолжаем работать с состоянием в памяти.
    }
}

/** Детерминированный идентификатор из строки (без Date.now и случайности). */
function stableDemoId(prefix: string, seed: string): string {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    }
    return `${prefix}-${(hash >>> 0).toString(16)}`;
}

/** Извлечь понятное сообщение об ошибке без использования `any`. */
function errorMessage(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

/**
 * Создать детерминированный локальный транспорт.
 * Пароль не сохраняется и не передаётся дальше проверки на непустоту.
 */
function createDemoAuthTransport(): AuthTransport {
    return {
        signInAsync: async (email, password) => {
            const normalizedEmail = email.trim();
            if (normalizedEmail.length === 0 || password.length === 0) {
                throw new Error('Введите email и пароль');
            }
            const separator = normalizedEmail.indexOf('@');
            const localPart = separator > 0 ? normalizedEmail.slice(0, separator) : normalizedEmail;
            return {
                id: stableDemoId('user', normalizedEmail),
                name: localPart.length > 0 ? localPart : 'Пользователь',
                email: normalizedEmail,
                // Демо-вход всегда создаёт владельца (первый пользователь кабинета).
                role: 'owner',
            };
        },
        signUpAsync: async (name, email, password) => {
            const normalizedName = name.trim();
            const normalizedEmail = email.trim();
            if (normalizedName.length === 0 || normalizedEmail.length === 0 || password.length === 0) {
                throw new Error('Заполните имя, email и пароль');
            }
            return {
                id: stableDemoId('user', normalizedEmail),
                name: normalizedName,
                email: normalizedEmail,
                role: 'owner',
            };
        },
        createProjectAsync: async (name) => {
            const normalizedName = name.trim();
            if (normalizedName.length === 0) {
                throw new Error('Введите название проекта');
            }
            return {
                id: stableDemoId('project', normalizedName),
                name: normalizedName,
                role: 'owner',
                updatedAt: DEMO_UPDATED_AT,
            };
        },
        inviteAsync: async ({ email, role }) => {
            const normalizedEmail = email.trim();
            const validRole = isInviteRole(role);
            // Пустой email или роль вне engineer/client отвергаются (документированное поведение).
            return normalizedEmail.length > 0 && validRole;
        },
    };
}

/** Активный транспорт: по умолчанию локальное демо без сети. */
let activeTransport: AuthTransport = createDemoAuthTransport();

/**
 * Подменить демо-транспорт реальным API (например, backend `AuthModule`).
 * @param transport Реализация контракта {@link AuthTransport}.
 */
export function setAuthTransport(transport: AuthTransport): void {
    activeTransport = transport;
}

/** Состояние кабинета и действия хранилища. */
export interface AuthState {
    /** Текущий пользователь; `null` означает гостевой режим. */
    user: AuthUser | null;
    /** Облачные проекты. */
    projects: readonly CloudProject[];
    /** Приглашения участников. */
    invites: readonly ProjectInvite[];
    /** Идёт ли асинхронная операция. */
    busy: boolean;
    /** Сообщение последней ошибки или `null`. */
    error: string | null;
    /** Войти; `true` при успехе. */
    signInAsync: (email: string, password: string) => Promise<boolean>;
    /** Зарегистрироваться с ролью владельца; `true` при успехе. */
    signUpAsync: (name: string, email: string, password: string) => Promise<boolean>;
    /** Выйти в гостевой режим (редактор остаётся доступным). */
    signOut: () => void;
    /** Создать облачный проект; `null` при ошибке. */
    createProjectAsync: (name: string) => Promise<CloudProject | null>;
    /** Пригласить участника; `false` при неверном email или роли. */
    inviteAsync: (projectId: string, email: string, role: InviteRole) => Promise<boolean>;
    /** Сбросить сообщение об ошибке. */
    clearError: () => void;
}

/** Стартовое состояние из localStorage (или пустое офлайн). */
const initialPersisted = loadPersistedAuthState();

/** Хранилище авторизации: гость — нормальный режим работы (RULES § 5.4). */
export const useAuthStore = create<AuthState>((set, get) => ({
    user: initialPersisted.user,
    projects: initialPersisted.projects,
    invites: initialPersisted.invites,
    busy: false,
    error: null,

    signInAsync: async (email, password) => {
        set({ busy: true, error: null });
        try {
            const user = await activeTransport.signInAsync(email, password);
            set({ user, busy: false });
            persistAuthState(get());
            return true;
        } catch (reason) {
            set({ busy: false, error: errorMessage(reason) });
            return false;
        }
    },

    signUpAsync: async (name, email, password) => {
        set({ busy: true, error: null });
        try {
            const user = await activeTransport.signUpAsync(name, email, password);
            set({ user, busy: false });
            persistAuthState(get());
            return true;
        } catch (reason) {
            set({ busy: false, error: errorMessage(reason) });
            return false;
        }
    },

    signOut: () => {
        // Проекты остаются доступными гостю: регистрация не требуется (RULES § 5.4).
        set({ user: null, busy: false, error: null });
        persistAuthState(get());
    },

    createProjectAsync: async (name) => {
        set({ busy: true, error: null });
        try {
            const project = await activeTransport.createProjectAsync(name);
            set((state) => ({ projects: [...state.projects, project], busy: false }));
            persistAuthState(get());
            return project;
        } catch (reason) {
            set({ busy: false, error: errorMessage(reason) });
            return null;
        }
    },

    inviteAsync: async (projectId, email, role) => {
        set({ busy: true, error: null });
        try {
            const invite: ProjectInvite = { projectId, email: email.trim(), role };
            const accepted = await activeTransport.inviteAsync(invite);
            if (!accepted) {
                set({ busy: false, error: 'Неверный email или роль участника' });
                return false;
            }
            set((state) => ({ invites: [...state.invites, invite], busy: false }));
            persistAuthState(get());
            return true;
        } catch (reason) {
            set({ busy: false, error: errorMessage(reason) });
            return false;
        }
    },

    clearError: () => set({ error: null }),
}));
