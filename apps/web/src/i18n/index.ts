// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import en from './en.json';
import ru from './ru.json';

/** Локали интерфейса. */
export type Locale = 'ru' | 'en';

/** Словарь строк интерфейса. */
export type Dictionary = Record<string, string>;

/** Все ключи строк интерфейса (assertEquals по ключам RU). */
export type TranslationKey = keyof typeof ru;

/** Словари интерфейса. */
export const dictionaries: Record<Locale, Dictionary> = { ru, en };

// Проверка на этапе компиляции: EN обязан содержать все ключи RU.
const _enCheck: Record<TranslationKey, string> = en;
void _enCheck;

/** Контекст локализации. */
export interface I18nContextValue {
    /** Текущая локаль. */
    locale: Locale;
    /** Сменить локаль. */
    setLocale: (locale: Locale) => void;
    /** Перевести ключ. */
    t: (key: TranslationKey) => string;
}

/** Контекст локализации React. */
export const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Получить контекст локализации.
 * @returns Значение контекста, созданное провайдером приложения.
 * @throws Если компонент вызван вне I18nContext.Provider.
 */
export function useI18n(): I18nContextValue {
    const value = useContext(I18nContext);
    if (value === null) {
        throw new Error('useI18n must be used within I18nContext.Provider');
    }
    return value;
}

/**
 * Провайдер локализации.
 * @param props Локаль, обработчик смены и дочерние элементы.
 * @returns React-элемент провайдера.
 */
export function I18nProvider({
    locale,
    setLocale,
    children,
}: {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    children: ReactNode;
}) {
    const t = (key: TranslationKey): string => dictionaries[locale][key] ?? key;
    return (
        <I18nContext.Provider value={{ locale, setLocale, t }}>
            {children}
        </I18nContext.Provider>
    );
}
