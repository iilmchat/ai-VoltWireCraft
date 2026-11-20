// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
/**
 * Разрешение режима темы и палитра для холстов, где недоступны CSS-переменные:
 * Konva рисует на `<canvas>` и не умеет разбирать `var(--md-sys-color-*)`.
 * Значения палитры повторяют роли из `styles/theme-m3.css` и используются
 * только как запасные при отсутствии документа (SSR/unit-тесты).
 */
import { useEffect, useState } from 'react';
import type { RoomZoneType } from '@voltwirecraft/shared/graph.schema.js';
import type { ThemeMode } from '../store/uiStore.js';
import { useUiStore } from '../store/uiStore.js';

/** Медиазапрос системной тёмной цветовой схемы. */
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/** Итоговая (конкретная) цветовая схема интерфейса. */
export type ResolvedTheme = 'light' | 'dark';

/** Палитра холста: роли Material 3 и семантические акценты графа. */
export interface CanvasPalette {
    /** Фон (`--md-sys-color-background`). */
    readonly background: string;
    /** Поверхность (`--md-sys-color-surface`). */
    readonly surface: string;
    /** Контейнер поверхности (`--md-sys-color-surface-container`). */
    readonly surfaceContainer: string;
    /** Нижний контейнер поверхности (`--md-sys-color-surface-container-lowest`). */
    readonly surfaceContainerLowest: string;
    /** Основной текст (`--md-sys-color-on-surface`). */
    readonly onSurface: string;
    /** Второстепенный текст (`--md-sys-color-on-surface-variant`). */
    readonly onSurfaceVariant: string;
    /** Основная линия (`--md-sys-color-outline`). */
    readonly outline: string;
    /** Мягкая линия сетки (`--md-sys-color-outline-variant`). */
    readonly outlineVariant: string;
    /** Первичный акцент (`--md-sys-color-primary`). */
    readonly primary: string;
    /** Текст на первичном акценте (`--md-sys-color-on-primary`). */
    readonly onPrimary: string;
    /** Третичный акцент (`--md-sys-color-tertiary`). */
    readonly tertiary: string;
    /** Ошибка (`--md-sys-color-error`). */
    readonly error: string;
    /** Инвертированная поверхность (`--md-sys-color-inverse-surface`). */
    readonly inverseSurface: string;
    /** Текст на инвертированной поверхности (`--md-sys-color-inverse-on-surface`). */
    readonly inverseOnSurface: string;
    /** Проёмы (двери): зелёный семантический акцент. */
    readonly doorway: string;
    /** Окна: лазурный семантический акцент. */
    readonly window: string;
    /** Кабельные трассы: акцент, отличный от стен и проёмов. */
    readonly cable: string;
    /** Выделение элементов и активного инструмента. */
    readonly highlight: string;
    /** Инструмент масштабирования: янтарный акцент. */
    readonly scale: string;
    /** Успешное состояние / предел селективности. */
    readonly success: string;
    /** Заливка типов помещений плана. */
    readonly rooms: Readonly<Record<RoomZoneType, string>>;
}

/** Запасные значения ролей для светлой схемы (совпадают с theme-m3.css). */
const LIGHT_PALETTE: CanvasPalette = {
    background: '#FEF7FF',
    surface: '#FEF7FF',
    surfaceContainer: '#F3EBF8',
    surfaceContainerLowest: '#FFFFFF',
    onSurface: '#1D1A23',
    onSurfaceVariant: '#494454',
    outline: '#7B7486',
    outlineVariant: '#CBC3D7',
    primary: '#6B38D4',
    onPrimary: '#FFFFFF',
    tertiary: '#006591',
    error: '#BA1A1A',
    inverseSurface: '#322F39',
    inverseOnSurface: '#F5EEFB',
    doorway: '#15803D',
    window: '#0369A1',
    cable: '#0284C7',
    highlight: '#BE185D',
    scale: '#B45309',
    success: '#15803D',
    rooms: {
        living: '#0284C7',
        wet: '#0E7490',
        kitchen: '#B45309',
        outdoor: '#15803D',
        utility: '#7C3AED',
    },
};

/** Запасные значения ролей для тёмной схемы (совпадают с theme-m3.css). */
const DARK_PALETTE: CanvasPalette = {
    background: '#15121B',
    surface: '#15121B',
    surfaceContainer: '#211E27',
    surfaceContainerLowest: '#0F0D15',
    onSurface: '#E7E0ED',
    onSurfaceVariant: '#CBC3D7',
    outline: '#958EA0',
    outlineVariant: '#494454',
    primary: '#D0BCFF',
    onPrimary: '#3C0091',
    tertiary: '#89CEFF',
    error: '#FFB4AB',
    inverseSurface: '#E7E0ED',
    inverseOnSurface: '#322F39',
    doorway: '#4ADE80',
    window: '#38BDF8',
    cable: '#38BDF8',
    highlight: '#F472B6',
    scale: '#FBBF24',
    success: '#34D399',
    rooms: {
        living: '#38BDF8',
        wet: '#22D3EE',
        kitchen: '#FBBF24',
        outdoor: '#4ADE80',
        utility: '#A78BFA',
    },
};

/** Запасные палитры по разрешённой схеме. */
const PALETTES: Readonly<Record<ResolvedTheme, CanvasPalette>> = {
    light: LIGHT_PALETTE,
    dark: DARK_PALETTE,
};

/**
 * Разрешить режим темы в конкретную светлую/тёмную схему.
 * Для `system` используется системный медиазапрос; при его отсутствии — тёмная схема.
 *
 * @param mode Режим темы из хранилища UI.
 * @returns Итоговая цветовая схема.
 */
export function resolveThemeMode(mode: ThemeMode): ResolvedTheme {
    if (mode !== 'system') {
        return mode;
    }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return 'dark';
    }
    return window.matchMedia(DARK_SCHEME_QUERY).matches ? 'dark' : 'light';
}

/**
 * Прочитать роль Material 3 из вычисленных стилей документа.
 * @param css Вычисленные стили корневого элемента или `null` вне DOM.
 * @param role Имя роли без префикса `--md-sys-color-`.
 * @param fallback Запасное значение, если роль не определена.
 * @returns Значение роли в формате CSS-цвета.
 */
function readRole(css: CSSStyleDeclaration | null, role: string, fallback: string): string {
    if (css === null) {
        return fallback;
    }
    const value = css.getPropertyValue(`--md-sys-color-${role}`).trim();
    return value === '' ? fallback : value;
}

/**
 * Получить палитру холста из CSS-ролей Material 3 с запасными значениями.
 * @param theme Разрешённая цветовая схема.
 * @returns Палитра с конкретными CSS-цветами для Konva и SVG.
 */
export function getCanvasPalette(theme: ResolvedTheme): CanvasPalette {
    const fallback = PALETTES[theme];
    const css = typeof document === 'undefined' || typeof getComputedStyle !== 'function'
        ? null
        : getComputedStyle(document.documentElement);
    return {
        background: readRole(css, 'background', fallback.background),
        surface: readRole(css, 'surface', fallback.surface),
        surfaceContainer: readRole(css, 'surface-container', fallback.surfaceContainer),
        surfaceContainerLowest: readRole(css, 'surface-container-lowest', fallback.surfaceContainerLowest),
        onSurface: readRole(css, 'on-surface', fallback.onSurface),
        onSurfaceVariant: readRole(css, 'on-surface-variant', fallback.onSurfaceVariant),
        outline: readRole(css, 'outline', fallback.outline),
        outlineVariant: readRole(css, 'outline-variant', fallback.outlineVariant),
        primary: readRole(css, 'primary', fallback.primary),
        onPrimary: readRole(css, 'on-primary', fallback.onPrimary),
        tertiary: readRole(css, 'tertiary', fallback.tertiary),
        error: readRole(css, 'error', fallback.error),
        inverseSurface: readRole(css, 'inverse-surface', fallback.inverseSurface),
        inverseOnSurface: readRole(css, 'inverse-on-surface', fallback.inverseOnSurface),
        doorway: fallback.doorway,
        window: fallback.window,
        cable: fallback.cable,
        highlight: fallback.highlight,
        scale: fallback.scale,
        success: fallback.success,
        rooms: fallback.rooms,
    };
}

/**
 * Хук текущей разрешённой темы: следит за режимом в хранилище и за сменой
 * системной цветовой схемы. Подписка снимается при размонтировании.
 * @returns Итоговая цветовая схема.
 */
export function useResolvedTheme(): ResolvedTheme {
    const themeMode = useUiStore((state) => state.themeMode);
    const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveThemeMode(themeMode));

    useEffect(() => {
        const update = (): void => setResolved(resolveThemeMode(themeMode));
        update();

        if (themeMode !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }
        const media = window.matchMedia(DARK_SCHEME_QUERY);
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', update);
            return () => media.removeEventListener('change', update);
        }
        // Устаревшие браузеры: слушатель через addListener/removeListener.
        media.addListener(update);
        return () => media.removeListener(update);
    }, [themeMode]);

    return resolved;
}
