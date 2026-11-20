// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
/**
 * Клиентский сервис обновлений десктопного приложения (Tauri).
 * RULES § 5.4: в браузере сервис не выполняет сетевых запросов; в Tauri
 * фоновые проверки при отсутствии сети завершаются тихо.
 */
import { isTauri } from '@tauri-apps/api/core';
import type { DownloadEvent } from '@tauri-apps/plugin-updater';
import { version as APP_VERSION } from '../../package.json';

/** Текущая версия приложения из `package.json` (RULES § 1.8). */
export { APP_VERSION };

/** Код ошибки проверки/установки обновления. */
export type AppUpdateErrorCode = 'unsupported' | 'check-failed' | 'install-failed';

/** Ошибка сервиса обновлений. */
export class AppUpdateError extends Error {
    /** Код ошибки для локализованного сообщения. */
    readonly code: AppUpdateErrorCode;

    /**
     * @param code Код ошибки.
     * @param message Техническое сообщение.
     */
    constructor(code: AppUpdateErrorCode, message: string) {
        super(message);
        this.name = 'AppUpdateError';
        this.code = code;
    }
}

/** Минимальный контракт объекта `Update` из Tauri API. */
interface TauriUpdateLike {
    /** Признак доступности обновления. */
    available: boolean;
    /** Новая версия. */
    version: string;
    /** Текущая версия. */
    currentVersion: string;
    /** Заметки к выпуску. */
    body?: string;
    /** Скачать и установить обновление с колбэком прогресса. */
    downloadAndInstall: (onEvent: (event: DownloadEvent) => void) => Promise<void>;
}

/** Доступное обновление с функцией установки. */
export interface AvailableUpdate {
    /** Признак доступности обновления. */
    available: true;
    /** Новая версия. */
    version: string;
    /** Текущая версия. */
    currentVersion: string;
    /** Заметки к выпуску. */
    notes: string;
    /** Скачать, установить и перезапустить приложение. */
    downloadAndInstallAsync: (onProgress?: (percent: number) => void) => Promise<void>;
}

/** Обновлений нет или проверка недоступна. */
export interface NoUpdate {
    /** Признак отсутствия обновления. */
    available: false;
}

/** Результат проверки обновлений. */
export type UpdateCheckResult = AvailableUpdate | NoUpdate;

/** Ограничение прогресса скачивания диапазоном 0…100. */
function clampPercent(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Преобразовать события загрузки Tauri в процент 0…100.
 * @param event Событие загрузки обновления.
 * @param state Накопленное состояние загрузки.
 * @param onProgress Колбэк прогресса (необязателен).
 */
function applyDownloadEvent(
    event: DownloadEvent,
    state: { contentLength: number; downloadedBytes: number },
    onProgress?: (percent: number) => void,
): void {
    if (event.event === 'Started') {
        state.contentLength = event.data.contentLength ?? 0;
        state.downloadedBytes = 0;
        onProgress?.(0);
        return;
    }
    if (event.event === 'Progress') {
        state.downloadedBytes += event.data.chunkLength;
        if (state.contentLength > 0) {
            onProgress?.(clampPercent((state.downloadedBytes / state.contentLength) * 100));
        }
        return;
    }
    // Событие Finished не дублирует 100 %: финальный процент отправляет вызывающая сторона.
}

/**
 * Проверить наличие обновления.
 *
 * В Web возвращает `{ available: false }` без сетевых запросов. В Tauri
 * при `silent === true` сетевые ошибки подавляются, при ручной проверке
 * выбрасывается `AppUpdateError`.
 *
 * @param silent Признак фоновой проверки.
 * @returns Результат проверки.
 * @throws {AppUpdateError} при ручной проверке и ошибке Tauri API.
 */
export async function checkForAppUpdateAsync(silent: boolean): Promise<UpdateCheckResult> {
    if (!isTauri()) {
        return { available: false };
    }

    let update: TauriUpdateLike | null;
    try {
        const { check } = await import('@tauri-apps/plugin-updater');
        update = await check();
    } catch (error) {
        if (silent) {
            return { available: false };
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new AppUpdateError('check-failed', message);
    }

    if (update === null || !update.available) {
        return { available: false };
    }

    const version = update.version;
    const currentVersion = update.currentVersion || APP_VERSION;
    const notes = update.body ?? '';

    return {
        available: true,
        version,
        currentVersion,
        notes,
        downloadAndInstallAsync: async (onProgress) => {
            const state = { contentLength: 0, downloadedBytes: 0 };
            try {
                await update.downloadAndInstall((event) => applyDownloadEvent(event, state, onProgress));
                onProgress?.(100);
                const { relaunch } = await import('@tauri-apps/plugin-process');
                await relaunch();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new AppUpdateError('install-failed', message);
            }
        },
    };
}
