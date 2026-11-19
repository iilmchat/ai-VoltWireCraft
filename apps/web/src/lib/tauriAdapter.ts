// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Адаптер нативных диалогов Tauri для файлов `.vwc` (RULES § 5.4). */
import { isTauri } from '@tauri-apps/api/core';

/** Фильтр диалога файлов проекта. */
const VWC_FILTER = { name: 'VoltWireCraft project', extensions: ['vwc'] };

/**
 * Проверить, запущено ли приложение в среде Tauri.
 * @returns true для десктопной сборки.
 */
export function isDesktop(): boolean {
    return isTauri();
}

/**
 * Сохранить проект через нативный системный диалог.
 * @param contents Содержимое файла `.vwc`.
 * @param suggestedName Предлагаемое имя файла.
 * @returns true, если файл сохранён; false при отмене диалога.
 */
export async function saveProjectNativeAsync(
    contents: string,
    suggestedName: string,
): Promise<boolean> {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({
        defaultPath: suggestedName,
        filters: [VWC_FILTER],
    });
    if (path === null) {
        return false;
    }
    await writeTextFile(path, contents);
    return true;
}

/**
 * Открыть проект через нативный системный диалог.
 * @returns Содержимое файла или null при отмене.
 */
export async function openProjectNativeAsync(): Promise<string | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const selected = await open({
        multiple: false,
        filters: [VWC_FILTER],
    });
    if (typeof selected !== 'string') {
        return null;
    }
    return readTextFile(selected);
}
