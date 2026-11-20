// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadEvent } from '@tauri-apps/plugin-updater';

/** Моки Tauri API, объявленные до загрузки тестируемого модуля. */
const mocks = vi.hoisted(() => ({
    isTauri: vi.fn<() => boolean>(() => false),
    check: vi.fn<() => Promise<unknown>>(async () => null),
    downloadAndInstall: vi.fn<(onEvent: (event: DownloadEvent) => void) => Promise<void>>(
        async () => undefined,
    ),
    relaunch: vi.fn<() => Promise<void>>(async () => undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: mocks.isTauri }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));

import { AppUpdateError, checkForAppUpdateAsync } from './updater.js';

/** Сбросить моки между тестами. */
function resetMocks(): void {
    mocks.isTauri.mockReset();
    mocks.check.mockReset();
    mocks.downloadAndInstall.mockReset();
    mocks.relaunch.mockReset();
    mocks.isTauri.mockReturnValue(false);
    mocks.check.mockResolvedValue(null);
    mocks.downloadAndInstall.mockResolvedValue(undefined);
    mocks.relaunch.mockResolvedValue(undefined);
}

describe('updater (RULES § 5.4)', () => {
    beforeEach(() => {
        resetMocks();
    });

    it('в браузере не выполняет проверку и не загружает Tauri API', async () => {
        const result = await checkForAppUpdateAsync(false);
        expect(result).toEqual({ available: false });
        expect(mocks.check).not.toHaveBeenCalled();
    });

    it('возвращает доступное обновление и сообщает прогресс скачивания', async () => {
        mocks.isTauri.mockReturnValue(true);
        const events: readonly DownloadEvent[] = [
            { event: 'Started', data: { contentLength: 200 } },
            { event: 'Progress', data: { chunkLength: 100 } },
            { event: 'Progress', data: { chunkLength: 100 } },
            { event: 'Finished' },
        ];
        mocks.downloadAndInstall.mockImplementation(async (onEvent) => {
            for (const event of events) {
                onEvent(event);
            }
        });
        mocks.check.mockResolvedValue({
            available: true,
            version: '0.7.0',
            currentVersion: '0.6.0',
            body: 'Новые шаблоны',
            downloadAndInstall: mocks.downloadAndInstall,
        });

        const result = await checkForAppUpdateAsync(false);
        expect(result.available).toBe(true);
        if (!result.available) {
            return;
        }
        expect(result.version).toBe('0.7.0');
        expect(result.notes).toBe('Новые шаблоны');

        const progress: number[] = [];
        await result.downloadAndInstallAsync((percent) => progress.push(percent));
        expect(progress).toEqual([0, 50, 100, 100]);
        expect(mocks.relaunch).toHaveBeenCalledOnce();
    });

    it('тихо игнорирует сетевую ошибку при фоновой проверке', async () => {
        mocks.isTauri.mockReturnValue(true);
        mocks.check.mockRejectedValue(new Error('network unavailable'));
        await expect(checkForAppUpdateAsync(true)).resolves.toEqual({ available: false });
    });

    it('сообщает об ошибке при ручной проверке', async () => {
        mocks.isTauri.mockReturnValue(true);
        mocks.check.mockRejectedValue(new Error('network unavailable'));
        await expect(checkForAppUpdateAsync(false)).rejects.toBeInstanceOf(AppUpdateError);
    });

    it('возвращает false, если обновлений нет', async () => {
        mocks.isTauri.mockReturnValue(true);
        mocks.check.mockResolvedValue(null);
        await expect(checkForAppUpdateAsync(true)).resolves.toEqual({ available: false });
    });
});
