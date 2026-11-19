// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Локальное сохранение проекта `.vwc` в формате схемы v2 (RULES § 5.4). */
import {
    ProjectGraphSchema,
    VwcFileSchema,
    parseVwcFile,
} from '@voltwirecraft/shared/graph.schema.js';
import type { ProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import {
    isDesktop,
    openProjectNativeAsync,
    saveProjectNativeAsync,
} from './tauriAdapter.js';

/** Код ошибки импорта проекта. */
export type ImportErrorCode =
    | 'invalidJson'
    | 'invalidFormat'
    | 'newerVersion'
    | 'olderVersion'
    | 'invalidGraph'
    | 'unknown';

/** Результат разбора файла проекта. */
export type ImportResult =
    | { ok: true; graph: ProjectGraph }
    | { ok: false; code: ImportErrorCode };

/** Формат файла проекта. */
const FILE_FORMAT = 'vwc-project';

/** Поддерживаемая версия схемы. */
export const SUPPORTED_SCHEMA_VERSION = 2;

/**
 * Сериализовать граф проекта в текст файла `.vwc` версии 2.
 * @param graph Граф проекта.
 * @returns Строка JSON со строго валидированным графом.
 * @throws Если граф не проходит валидацию.
 */
export function serializeProject(graph: ProjectGraph): string {
    const validatedGraph = ProjectGraphSchema.parse(graph);
    const file = VwcFileSchema.parse({
        format: FILE_FORMAT,
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        graph: validatedGraph,
        savedAt: new Date().toISOString(),
    });
    return JSON.stringify(file, null, 2);
}

/**
 * Разобрать текст файла `.vwc`: v1 мигрируется в v2 канонической функцией.
 * @param text Содержимое файла.
 * @returns Успешно загруженный граф или код ошибки.
 */
export function parseProject(text: string): ImportResult {
    let raw: unknown;
    try {
        raw = JSON.parse(text) as unknown;
    } catch {
        return { ok: false, code: 'invalidJson' };
    }

    try {
        const file = parseVwcFile(raw);
        return { ok: true, graph: file.graph };
    } catch {
        const body = isRecord(raw) ? raw : null;
        if (body === null || body['format'] !== FILE_FORMAT) {
            return { ok: false, code: 'invalidFormat' };
        }
        const version = body['schemaVersion'];
        if (typeof version === 'number' && version > SUPPORTED_SCHEMA_VERSION) {
            return { ok: false, code: 'newerVersion' };
        }
        if (typeof version === 'number' && version < 1) {
            return { ok: false, code: 'olderVersion' };
        }
        return { ok: false, code: 'invalidGraph' };
    }
}

/**
 * Проверить, что значение — обычный объект.
 * @param value Проверяемое значение.
 * @returns true для записи с строковыми ключами.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Скачать проект как файл `.vwc` через браузерный API.
 * @param graph Граф проекта.
 * @param fileName Имя файла без расширения.
 * @returns Promise, разрешающийся после инициации скачивания.
 */
export async function downloadProjectAsync(graph: ProjectGraph, fileName: string): Promise<void> {
    const contents = serializeProject(graph);
    const blob = new Blob([contents], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${fileName}.vwc`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    await Promise.resolve();
}

/**
 * Сохранить проект: нативный диалог в Tauri, скачивание в браузере (RULES § 5.4).
 * @param graph Граф проекта.
 * @param fileName Имя файла без расширения.
 * @returns true, если сохранение подтверждено/инициировано.
 */
export async function saveProjectAsync(graph: ProjectGraph, fileName: string): Promise<boolean> {
    const contents = serializeProject(graph);
    if (isDesktop()) {
        return saveProjectNativeAsync(contents, `${fileName}.vwc`);
    }
    await downloadProjectAsync(graph, fileName);
    return true;
}

/**
 * Открыть проект через нативный диалог Tauri.
 * @returns Содержимое `.vwc` или null (браузер использует file input).
 */
export async function openProjectAsync(): Promise<string | null> {
    if (!isDesktop()) {
        return null;
    }
    return openProjectNativeAsync();
}
