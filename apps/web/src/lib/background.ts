// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { BackgroundSchema } from '@voltwirecraft/shared';
import type { Background } from '@voltwirecraft/shared';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Масштаб растеризации страницы PDF. */
export const PDF_RENDER_SCALE = 2;

/** Загруженная подложка: описание для графа и растр для Konva. */
export interface LoadedBackground {
    /** Описание подложки для сохранения в графе. */
    background: Background;
    /** Растровое изображение для нижнего слоя холста. */
    image: HTMLImageElement | HTMLCanvasElement;
}

/**
 * Прочитать файл как data URL.
 * @param file Файл подложки.
 * @returns Promise с data URL.
 */
function readAsDataUrlAsync(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(String(reader.result));
        };
        reader.onerror = () => {
            reject(new Error('Не удалось прочитать файл'));
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Загрузить растровое изображение PNG/JPG.
 * @param file Файл изображения.
 * @param kind Тип изображения.
 * @returns Описание подложки и изображение.
 */
async function loadRasterAsync(file: File, kind: 'png' | 'jpg'): Promise<LoadedBackground> {
    const dataUrl = await readAsDataUrlAsync(file);
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const widthPx = image.naturalWidth;
    const heightPx = image.naturalHeight;
    if (widthPx <= 0 || heightPx <= 0) {
        throw new Error('Изображение имеет нулевой размер');
    }
    const background = BackgroundSchema.parse({
        kind,
        name: file.name,
        pageNumber: null,
        widthPx,
        heightPx,
        dataUrl,
    });
    return { background, image };
}

/**
 * Загрузить и растеризовать выбранную страницу PDF.
 * @param file Файл PDF.
 * @param pageNumber Номер страницы (начиная с 1).
 * @returns Описание подложки и отрендеренный canvas.
 */
async function loadPdfAsync(file: File, pageNumber: number): Promise<LoadedBackground> {
    const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist');
    GlobalWorkerOptions.workerSrc = workerUrl;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask = getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    try {
        if (pageNumber < 1 || pageNumber > pdf.numPages) {
            throw new Error(`Страница ${pageNumber} отсутствует в PDF`);
        }
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        if (canvas.getContext('2d') === null) {
            throw new Error('Не удалось получить 2D-контекст canvas');
        }
        await page.render({ canvas, viewport }).promise;
        const background = BackgroundSchema.parse({
            kind: 'pdf',
            name: file.name,
            pageNumber,
            widthPx: canvas.width,
            heightPx: canvas.height,
            dataUrl: canvas.toDataURL('image/png'),
        });
        return { background, image: canvas };
    } finally {
        await loadingTask.destroy();
    }
}

/**
 * Загрузить подложку из файла PDF/PNG/JPG.
 * @param file Файл плана.
 * @param pageNumber Номер страницы PDF (по умолчанию 1).
 * @returns Описание подложки и изображение для холста.
 * @throws При неподдерживаемом типе файла или ошибке разбора.
 */
export async function loadBackgroundAsync(file: File, pageNumber = 1): Promise<LoadedBackground> {
    const extension = file.name.toLowerCase().split('.').pop() ?? '';
    if (file.type === 'application/pdf' || extension === 'pdf') {
        return loadPdfAsync(file, pageNumber);
    }
    if (file.type === 'image/png' || extension === 'png') {
        return loadRasterAsync(file, 'png');
    }
    if (file.type === 'image/jpeg' || file.type === 'image/jpg' || extension === 'jpg' || extension === 'jpeg') {
        return loadRasterAsync(file, 'jpg');
    }
    throw new Error(`Неподдерживаемый тип файла: ${file.type || extension}`);
}

/**
 * Восстановить изображение подложки из data URL графа.
 * @param background Описание подложки из графа.
 * @returns Promise с изображением для Konva.
 */
export async function restoreBackgroundImageAsync(background: Background): Promise<HTMLImageElement> {
    const image = new Image();
    image.src = background.dataUrl;
    await image.decode();
    return image;
}
