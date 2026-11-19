// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0

/** Пространство имён SVG по спецификации W3C. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/** Пространство имён XLink (используется рядом SVG-редакторов). */
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
/** Масштаб растеризации по умолчанию. */
const DEFAULT_RASTER_SCALE = 1;
/** Масштаб растеризации для встраивания в PDF. */
const PDF_RASTER_SCALE = 2;
/** Отступ страницы A4 при встраивании схемы, мм. */
const PDF_MARGIN_MM = 10;

/**
 * Инициировать скачивание готового Blob через временную ссылку.
 * @param blob Данные файла.
 * @param fileName Имя скачиваемого файла.
 * @returns Promise, разрешающийся после инициации скачивания.
 */
async function downloadBlobAsync(blob: Blob, fileName: string): Promise<void> {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    await Promise.resolve();
}

/**
 * Сериализовать SVG-элемент в автономную строку XML.
 * Клонирование не изменяет исходный элемент на странице; при необходимости
 * добавляются пространства имён и явные размеры (их требуют растеризаторы).
 * @param svg Корневой элемент SVG однолинейной схемы.
 * @returns Promise со строкой XML.
 */
export async function serializeSvgAsync(svg: SVGSVGElement): Promise<string> {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', SVG_NAMESPACE);
    clone.setAttribute('xmlns:xlink', XLINK_NAMESPACE);

    if (!clone.hasAttribute('width') || !clone.hasAttribute('height')) {
        const viewBox = svg.viewBox.baseVal;
        const bounds = svg.getBoundingClientRect();
        const width = viewBox.width > 0 ? viewBox.width : bounds.width;
        const height = viewBox.height > 0 ? viewBox.height : bounds.height;
        clone.setAttribute('width', String(Math.max(1, Math.ceil(width))));
        clone.setAttribute('height', String(Math.max(1, Math.ceil(height))));
    }

    return new XMLSerializer().serializeToString(clone);
}

/**
 * Скачать однолинейную схему как файл SVG.
 * @param svg Корневой элемент SVG однолинейной схемы.
 * @param fileName Имя файла без расширения.
 * @returns Promise, разрешающийся после инициации скачивания.
 */
export async function downloadSvgAsync(svg: SVGSVGElement, fileName: string): Promise<void> {
    const contents = await serializeSvgAsync(svg);
    const blob = new Blob([contents], { type: 'text/svg+xml;charset=utf-8' });
    await downloadBlobAsync(blob, `${fileName}.svg`);
}

/**
 * Растеризовать SVG в canvas с белым фоном.
 * Используется data URL на основе `encodeURIComponent`: blob URL иногда
 * блокируются политикой CSP или не загружаются в Images внутри песочницы.
 * @param svg Корневой элемент SVG однолинейной схемы.
 * @param scale Коэффициент увеличения растра (по умолчанию 1).
 * @returns Promise с готовым canvas.
 * @throws Если SVG не удалось загрузить как изображение или недоступен 2D-контекст.
 */
export async function rasterizeSvgAsync(
    svg: SVGSVGElement,
    scale: number = DEFAULT_RASTER_SCALE,
): Promise<HTMLCanvasElement> {
    const contents = await serializeSvgAsync(svg);
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(contents)}`;
    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_RASTER_SCALE;
    const bounds = svg.getBoundingClientRect();
    const sourceWidth = image.naturalWidth > 0 ? image.naturalWidth : bounds.width;
    const sourceHeight = image.naturalHeight > 0 ? image.naturalHeight : bounds.height;
    const width = Math.max(1, Math.round(sourceWidth * safeScale));
    const height = Math.max(1, Math.round(sourceHeight * safeScale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) {
        throw new Error('Не удалось получить 2D-контекст canvas');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas;
}

/**
 * Скачать однолинейную схему как растровый файл PNG.
 * @param svg Корневой элемент SVG однолинейной схемы.
 * @param fileName Имя файла без расширения.
 * @returns Promise, разрешающийся после инициации скачивания.
 * @throws Если браузер не смог создать Blob из canvas.
 */
export async function downloadPngAsync(svg: SVGSVGElement, fileName: string): Promise<void> {
    const canvas = await rasterizeSvgAsync(svg);
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
            if (result === null) {
                reject(new Error('Не удалось закодировать PNG'));
                return;
            }
            resolve(result);
        }, 'image/png');
    });
    await downloadBlobAsync(blob, `${fileName}.png`);
}

/**
 * Скачать однолинейную схему как документ PDF (A4, альбомная ориентация).
 * Изображение вписывается в страницу с отступами и центрируется.
 * @param svg Корневой элемент SVG однолинейной схемы.
 * @param fileName Имя файла без расширения.
 * @returns Promise, разрешающийся после сохранения документа.
 */
export async function downloadPdfAsync(svg: SVGSVGElement, fileName: string): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const canvas = await rasterizeSvgAsync(svg, PDF_RASTER_SCALE);
    const pngDataUrl = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const availableWidth = pageWidth - PDF_MARGIN_MM * 2;
    const availableHeight = pageHeight - PDF_MARGIN_MM * 2;
    const fitScale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
    const imageWidth = canvas.width * fitScale;
    const imageHeight = canvas.height * fitScale;
    const x = (pageWidth - imageWidth) / 2;
    const y = (pageHeight - imageHeight) / 2;

    pdf.addImage(pngDataUrl, 'PNG', x, y, imageWidth, imageHeight);
    pdf.save(`${fileName}.pdf`);
}
