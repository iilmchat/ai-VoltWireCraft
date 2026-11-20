// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
/** Модульные тесты переключения темы в хранилище интерфейса (node environment). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveThemeMode } from '../lib/theme.js';
import { THEME_STORAGE_KEY, useUiStore } from './uiStore.js';

/** Минимальный контракт localStorage, необходимый хранилищу тем. */
interface LocalStorageStub {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

/** Минимальный контракт matchMedia, необходимый для разрешения системной темы. */
type MatchMediaStub = (query: string) => { matches: boolean };

/** Установить заглушки браузерного окружения для очередного теста. */
function stubBrowserEnvironment(prefersDark: boolean): {
    storage: Map<string, string>;
    dataset: Record<string, string>;
    matchMedia: ReturnType<typeof vi.fn>;
} {
    const storage = new Map<string, string>();
    const dataset: Record<string, string> = {};
    const localStorageStub: LocalStorageStub = {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
            storage.set(key, value);
        },
    };
    const matchMedia = vi.fn<MatchMediaStub>(() => ({ matches: prefersDark }));
    vi.stubGlobal('window', { localStorage: localStorageStub, matchMedia });
    vi.stubGlobal('document', { documentElement: { dataset } });
    return { storage, dataset, matchMedia };
}

describe('uiStore: тема интерфейса', () => {
    beforeEach(() => {
        // Состояние хранилища живёт между тестами, сбрасываем только режим темы.
        useUiStore.setState({ themeMode: 'system' });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('setThemeMode сохраняет выбор в localStorage и обновляет состояние', () => {
        const { storage, dataset } = stubBrowserEnvironment(false);

        useUiStore.getState().setThemeMode('light');

        expect(storage.get(THEME_STORAGE_KEY)).toBe('light');
        expect(dataset['theme']).toBe('light');
        expect(useUiStore.getState().themeMode).toBe('light');
    });

    it('setThemeMode применяет тёмную тему к корневому элементу документа', () => {
        const { storage, dataset } = stubBrowserEnvironment(true);

        useUiStore.getState().setThemeMode('dark');

        expect(storage.get(THEME_STORAGE_KEY)).toBe('dark');
        expect(dataset['theme']).toBe('dark');
        expect(useUiStore.getState().themeMode).toBe('dark');
    });

    it('setThemeMode сохраняет режим system без привязки к текущей схеме ОС', () => {
        const { storage, dataset } = stubBrowserEnvironment(true);

        useUiStore.getState().setThemeMode('system');

        expect(storage.get(THEME_STORAGE_KEY)).toBe('system');
        expect(dataset['theme']).toBe('system');
        expect(useUiStore.getState().themeMode).toBe('system');
    });

    it('resolveThemeMode возвращает явные режимы без обращения к matchMedia', () => {
        const { matchMedia } = stubBrowserEnvironment(true);

        expect(resolveThemeMode('light')).toBe('light');
        expect(resolveThemeMode('dark')).toBe('dark');
        expect(matchMedia).not.toHaveBeenCalled();
    });

    it('resolveThemeMode для system читает системный медиазапрос', () => {
        const dark = stubBrowserEnvironment(true);
        expect(resolveThemeMode('system')).toBe('dark');
        expect(dark.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');

        vi.unstubAllGlobals();
        const light = stubBrowserEnvironment(false);
        expect(resolveThemeMode('system')).toBe('light');
        expect(light.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    });

    it('resolveThemeMode для system возвращает dark без matchMedia или window', () => {
        stubBrowserEnvironment(false);
        vi.stubGlobal('window', { localStorage: new Map<string, string>() });
        expect(resolveThemeMode('system')).toBe('dark');

        vi.stubGlobal('window', undefined);
        expect(resolveThemeMode('system')).toBe('dark');
    });
});
