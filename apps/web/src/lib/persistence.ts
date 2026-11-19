// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import {
    ProjectGraphSchema,
    VwcFileSchema,
} from '@voltwirecraft/shared';
import type { ProjectGraph } from '@voltwirecraft/shared';

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
const SUPPORTED_SCHEMA_VERSION = 1;

/**
 * Сериализовать граф проекта в текст файла `.vwc`.
 * Граф проверяется через ProjectGraphSchema перед записью (RULES § 1.12).
 * @param graph Граф проекта.
 * @returns Строка JSON со строго валидированным графом.
 * @throws Если граф не проходит валидацию.
 */
export function serializeProject(graph: ProjectGraph): string {
    const validatedGraph = ProjectGraphSchema.parse(graph);
    return JSON.stringify(
        {
            format: FILE_FORMAT,
            schemaVersion: SUPPORTED_SCHEMA_VERSION,
            graph: validatedGraph,
            savedAt: new Date().toISOString(),
        },
        null,
        2,
    );
}

/**
 * Разобрать текст файла `.vwc` с проверкой формата, версии и графа.
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

    const envelope = VwcFileSchema.safeParse(raw);
    if (!envelope.success) {
        const body = isRecord(raw) ? raw : null;
        if (body === null || body['format'] !== FILE_FORMAT) {
            return { ok: false, code: 'invalidFormat' };
        }
        const version = body['schemaVersion'];
        if (typeof version === 'number' && version > SUPPORTED_SCHEMA_VERSION) {
            return { ok: false, code: 'newerVersion' };
        }
        if (typeof version === 'number' && version < SUPPORTED_SCHEMA_VERSION) {
            return { ok: false, code: 'olderVersion' };
        }
        const graphResult = ProjectGraphSchema.safeParse(body['graph']);
        if (!graphResult.success) {
            return { ok: false, code: 'invalidGraph' };
        }
        return { ok: false, code: 'unknown' };
    }

    return { ok: true, graph: envelope.data.graph };
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
