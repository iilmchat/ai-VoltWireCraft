// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY, isGuestUser, useAuthStore } from './authStore.js';

/** Простая реализация localStorage для node-окружения. */
function makeStorage(): Storage {
    const data = new Map<string, string>();
    return {
        get length() { return data.size; },
        clear: () => data.clear(),
        getItem: (key: string) => data.get(key) ?? null,
        key: (index: number) => [...data.keys()][index] ?? null,
        removeItem: (key: string) => { data.delete(key); },
        setItem: (key: string, value: string) => { data.set(key, value); },
    };
}

describe('авторизация и гостевой режим', () => {
    beforeEach(() => {
        vi.stubGlobal('window', { localStorage: makeStorage() });
        useAuthStore.setState({ user: null, projects: [], invites: [], error: null, busy: false });
    });

    it('гостевой режим не требует пользователя', () => {
        expect(isGuestUser(useAuthStore.getState().user)).toBe(true);
        expect(useAuthStore.getState().projects).toHaveLength(0);
    });

    it('вход создаёт пользователя-владельца', async () => {
        const ok = await useAuthStore.getState().signInAsync('owner@example.com', 'secret');
        expect(ok).toBe(true);
        expect(useAuthStore.getState().user?.email).toBe('owner@example.com');
        expect(useAuthStore.getState().user?.role).toBe('owner');
        expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toContain('owner@example.com');
    });

    it('выход возвращает в гостевой режим, редактор остаётся доступным', async () => {
        await useAuthStore.getState().signInAsync('owner@example.com', 'secret');
        useAuthStore.getState().signOut();
        expect(isGuestUser(useAuthStore.getState().user)).toBe(true);
    });

    it('создание проекта и приглашение участника', async () => {
        await useAuthStore.getState().signInAsync('owner@example.com', 'secret');
        const project = await useAuthStore.getState().createProjectAsync('Проект А');
        expect(project?.role).toBe('owner');
        expect(useAuthStore.getState().projects).toHaveLength(1);
        expect(project).not.toBeNull();
        if (project === null) {
            return;
        }
        const invited = await useAuthStore.getState().inviteAsync(project.id, 'client@example.com', 'client');
        expect(invited).toBe(true);
        expect(useAuthStore.getState().invites[0]?.role).toBe('client');
    });
});
