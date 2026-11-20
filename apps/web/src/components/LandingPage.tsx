// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
/** Целевая страница продукта: редактор, десктопная сборка и демо-проекты. */
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { DEMO_PROJECTS } from '../lib/demoProjects.js';
import type { DemoProjectId } from '../lib/demoProjects.js';
import { useUiStore } from '../store/uiStore.js';
import type { ThemeMode } from '../store/uiStore.js';

/** Ссылка на последний релиз десктопного приложения. */
const RELEASES_URL = 'https://github.com/iilmchat/VoltWireCraft/releases/latest';

/** Порядок циклического переключения темы. */
const THEME_CYCLE: readonly ThemeMode[] = ['light', 'dark', 'system'];

/** Имя иконки карточки преимущества. */
type FeatureIconName = 'plan' | 'panel' | 'panel3d' | 'tcc' | 'gost' | 'ai';

/** Описание карточки преимущества. */
interface FeatureCard {
    /** Ключ текста в i18n. */
    key: TranslationKey;
    /** Иконка карточки. */
    icon: FeatureIconName;
}

/** Шесть карточек полного цикла проектирования. */
const FEATURES: readonly FeatureCard[] = [
    { key: 'landing.feature.plan', icon: 'plan' },
    { key: 'landing.feature.panel', icon: 'panel' },
    { key: 'landing.feature.panel3d', icon: 'panel3d' },
    { key: 'landing.feature.tcc', icon: 'tcc' },
    { key: 'landing.feature.gost', icon: 'gost' },
    { key: 'landing.feature.ai', icon: 'ai' },
];

/**
 * Обёртка для SVG-иконок, нарисованных штрихами `currentColor`.
 * @param props Дочерние элементы контура иконки.
 * @returns React-элемент иконки.
 */
function StrokeIcon({ children }: { children: ReactNode }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

/**
 * Иконка режима темы.
 * @param mode Текущий режим темы.
 * @returns React-элемент иконки.
 */
function ThemeIcon({ mode }: { mode: ThemeMode }) {
    if (mode === 'light') {
        return (
            <StrokeIcon>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </StrokeIcon>
        );
    }
    if (mode === 'dark') {
        return (
            <StrokeIcon>
                <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
            </StrokeIcon>
        );
    }
    return (
        <StrokeIcon>
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M9 21h6M12 17v4" />
        </StrokeIcon>
    );
}

/**
 * Иконка карточки преимущества.
 * @param name Имя иконки.
 * @returns React-элемент иконки.
 */
function FeatureIcon({ name }: { name: FeatureIconName }) {
    switch (name) {
        case 'plan':
            return (
                <StrokeIcon>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M10 3v18M3 10h7M14 21v-8h7" />
                </StrokeIcon>
            );
        case 'panel':
            return (
                <StrokeIcon>
                    <rect x="4" y="2.5" width="16" height="19" rx="2" />
                    <path d="M7 7h10M7 11h3M14 11h3M7 15h3M14 15h3M12 18v1.5" />
                </StrokeIcon>
            );
        case 'panel3d':
            return (
                <StrokeIcon>
                    <path d="M12 2.8 21 7.5v9L12 21.2 3 16.5v-9L12 2.8Z" />
                    <path d="m3 7.5 9 4.7 9-4.7M12 12.2v9" />
                </StrokeIcon>
            );
        case 'tcc':
            return (
                <StrokeIcon>
                    <path d="M3 3v18h18" />
                    <path d="M5 19c4 0 5-8 9-8s4 5 6 5" />
                    <path d="M5 15c5 0 6-8 10-8" />
                </StrokeIcon>
            );
        case 'gost':
            return (
                <StrokeIcon>
                    <path d="M6 2.5h8l4 4V21.5H6z" />
                    <path d="M14 2.5v4h4M9 11.5h6M9 15.5h6" />
                </StrokeIcon>
            );
        case 'ai':
            return (
                <StrokeIcon>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
                </StrokeIcon>
            );
    }
}

/**
 * Целевая страница приложения без оболочки редактора.
 * @param props Обработчики открытия редактора и загрузки демо-проекта.
 * @returns React-элемент страницы.
 */
export function LandingPage({
    onOpenEditor,
    onLoadDemo,
}: {
    onOpenEditor: () => void;
    onLoadDemo: (id: DemoProjectId) => void;
}) {
    const { t } = useI18n();
    const themeMode = useUiStore((state) => state.themeMode);
    const setThemeMode = useUiStore((state) => state.setThemeMode);

    /** Циклическое переключение темы: светлая → тёмная → системная. */
    const handleCycleTheme = (): void => {
        const index = THEME_CYCLE.indexOf(themeMode);
        const next = THEME_CYCLE[(index + 1) % THEME_CYCLE.length];
        if (next !== undefined) {
            setThemeMode(next);
        }
    };

    /** Загрузить шаблон и открыть редактор. */
    const handleOpenDemo = (id: DemoProjectId): void => {
        onLoadDemo(id);
        onOpenEditor();
    };

    return (
        <div className="min-h-screen bg-background text-on-surface">
            <header className="sticky top-0 z-20 border-b border-outline-variant bg-surface-container-low/95 backdrop-blur">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                    <div className="flex items-center">
                        <img
                            src="/brand/logo-icon.svg"
                            alt={t('app.title')}
                            className="h-10 w-10 sm:hidden"
                        />
                        <img
                            src="/brand/logo-full.svg"
                            alt={t('app.title')}
                            className="hidden h-10 w-auto sm:block"
                        />
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleCycleTheme}
                            title={t('theme.switch')}
                            aria-label={`${t('theme.switch')}: ${t(`theme.${themeMode}` as TranslationKey)}`}
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-outline text-on-surface-variant transition-colors hover:bg-secondary-container hover:text-on-secondary-container"
                        >
                            <ThemeIcon mode={themeMode} />
                        </button>
                        <button
                            type="button"
                            onClick={onOpenEditor}
                            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
                        >
                            {t('landing.cta.editor')}
                        </button>
                    </div>
                </div>
            </header>

            <main>
                <section
                    aria-labelledby="landing-hero-title"
                    className="bg-surface-container-low/60"
                >
                    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
                        <h1
                            id="landing-hero-title"
                            className="max-w-4xl text-4xl font-bold tracking-tight text-on-surface sm:text-5xl lg:text-6xl"
                        >
                            {t('landing.hero.title')}
                        </h1>
                        <p className="mt-6 max-w-3xl text-base leading-relaxed text-on-surface-variant sm:text-lg">
                            {t('landing.hero.subtitle')}
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={onOpenEditor}
                                className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
                            >
                                {t('landing.cta.editor')}
                            </button>
                            <a
                                href="#download"
                                className="rounded-full border border-outline px-6 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:bg-secondary-container hover:text-on-secondary-container"
                            >
                                {t('landing.cta.desktop')}
                            </a>
                        </div>
                    </div>
                </section>

                <section aria-labelledby="landing-features-title">
                    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
                        <h2
                            id="landing-features-title"
                            className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl"
                        >
                            {t('landing.features.title')}
                        </h2>
                        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {FEATURES.map((feature) => (
                                <article
                                    key={feature.key}
                                    className="rounded-3xl border border-outline-variant bg-surface-container p-6"
                                >
                                    <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary-container text-on-secondary-container">
                                        <FeatureIcon name={feature.icon} />
                                    </span>
                                    <p className="text-sm leading-relaxed text-on-surface">
                                        {t(feature.key)}
                                    </p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section
                    id="download"
                    aria-labelledby="landing-download-title"
                    className="bg-surface-container-low"
                >
                    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
                        <h2
                            id="landing-download-title"
                            className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl"
                        >
                            {t('landing.desktop.title')}
                        </h2>
                        <p className="mt-4 max-w-3xl text-base leading-relaxed text-on-surface-variant">
                            {t('landing.desktop.desc')}
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <a
                                href={RELEASES_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
                            >
                                {t('landing.windows')}
                            </a>
                            <a
                                href={RELEASES_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-full border border-outline px-6 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:bg-secondary-container hover:text-on-secondary-container"
                            >
                                {t('landing.linux')}
                            </a>
                        </div>
                    </div>
                </section>

                <section aria-labelledby="landing-templates-title">
                    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
                        <h2
                            id="landing-templates-title"
                            className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl"
                        >
                            {t('landing.templates.title')}
                        </h2>
                        <p className="mt-4 max-w-3xl text-base leading-relaxed text-on-surface-variant">
                            {t('landing.templates.desc')}
                        </p>
                        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {DEMO_PROJECTS.map((demo) => (
                                <article
                                    key={demo.id}
                                    className="flex h-full flex-col rounded-3xl border border-outline-variant bg-surface-container p-5"
                                >
                                    <h3 className="text-base font-semibold text-on-surface">
                                        {t(demo.nameKey)}
                                    </h3>
                                    <p className="mt-2 flex-1 text-sm leading-relaxed text-on-surface-variant">
                                        {t(demo.descriptionKey)}
                                    </p>
                                    {demo.badgeKey !== undefined && (
                                        <span className="mt-3 w-fit rounded-full bg-tertiary-container px-2.5 py-1 text-xs text-on-tertiary-container">
                                            {t(demo.badgeKey)}
                                        </span>
                                    )}
                                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-on-surface-variant">
                                        <span className="rounded-full bg-surface-container-high px-2.5 py-1">
                                            {demo.supply === '400'
                                                ? t('template.phase3p')
                                                : t('template.phase1p')}
                                        </span>
                                        <span className="rounded-full bg-surface-container-high px-2.5 py-1">
                                            {demo.powerKw} {t('template.kw')}
                                        </span>
                                        <span className="rounded-full bg-surface-container-high px-2.5 py-1">
                                            {demo.groups} {t('template.groups')}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenDemo(demo.id)}
                                        className="mt-5 w-fit rounded-full bg-primary-container px-4 py-2 text-sm font-medium text-on-primary-container transition-opacity hover:opacity-90"
                                    >
                                        {t('landing.openDemo')}
                                    </button>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-outline-variant bg-surface-container-low">
                <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-on-surface-variant sm:px-6">
                    {t('landing.footer')}
                </div>
            </footer>
        </div>
    );
}
