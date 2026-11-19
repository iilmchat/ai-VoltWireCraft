// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import type { GraphEdge, GraphNode, ProjectGraph } from '@voltwirecraft/shared/graph.schema.js';

/** Марка кабеля по умолчанию, если в ребре графа марка не указана. */
const DEFAULT_CABLE_BRAND = 'ВВГнг(А)-LS';

/** Марка алюминиевого кабеля, используемая в артикуле. */
const ALUMINUM_ARTICLE_BRAND = 'АПВГ';

/** Цена кабеля по умолчанию, ₽/м. */
const DEFAULT_CABLE_PRICE_RUB_PER_M = 300;

/** Уставка УЗО по умолчанию, мА. */
const DEFAULT_RCD_CURRENT_MA = 30;

/** Заголовки CSV по умолчанию (русская локаль); компонент передаёт локализованные строки. */
const DEFAULT_CSV_HEADERS: readonly string[] = [
    'Наименование',
    'Кол-во',
    'Длина, м',
    'Артикул',
    'Цена, ₽',
    'Сумма, ₽',
];

/** Типы узлов графа, которые попадают в раздел защитных аппаратов спецификации. */
type DeviceBomKind =
    | 'panel'
    | 'circuit_breaker'
    | 'rcd'
    | 'rcbo'
    | 'relay_voltage'
    | 'contactor'
    | 'input_source';

/** Множество типов узлов-защитных аппаратов. */
const DEVICE_BOM_KINDS: ReadonlySet<string> = new Set<DeviceBomKind>([
    'panel',
    'circuit_breaker',
    'rcd',
    'rcbo',
    'relay_voltage',
    'contactor',
    'input_source',
]);

/** Цены защитных аппаратов по типу УГО, ₽. */
const DEVICE_PRICE_RUB: Readonly<Record<DeviceBomKind, number>> = {
    panel: 4500,
    circuit_breaker: 350,
    rcd: 1800,
    rcbo: 2600,
    relay_voltage: 1200,
    contactor: 900,
    input_source: 3000,
};

/** Цена кабеля по сечению жилы, ₽/м. */
const CABLE_PRICE_RUB_PER_M: Readonly<Record<number, number>> = {
    1.5: 45,
    2.5: 70,
    4: 105,
    6: 150,
    10: 240,
};

/** Строка спецификации: кабель или защитный аппарат. */
export interface BomRow {
    /** Наименование позиции (марка кабеля с числом жил и сечением либо подпись узла). */
    name: string;
    /** Количество позиций: число линий для кабеля, всегда 1 для защитного аппарата. */
    quantity: number;
    /** Суммарная длина кабеля, м; `null` для защитных аппаратов. */
    lengthM: number | null;
    /** Артикул изделия, например `IEK C16 1P` или `ВВГнг(А)-LS 3x2.5`. */
    article: string;
    /** Цена за единицу: ₽/м для кабеля, ₽ за штуку для аппарата. */
    priceRub: number;
    /** Стоимость позиции: `priceRub` × длину или количество, ₽. */
    totalRub: number;
    /** Идентификатор первого ребра графа для кабеля или узла графа для аппарата. */
    sourceId?: string;
}

/**
 * Округлить деньги до копеек.
 * @param value Исходное значение, ₽.
 * @returns Значение с точностью до 0,01 ₽.
 */
function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Проверить, что тип узла относится к защитным аппаратам спецификации.
 * @param kind Тип УГО узла из канонического графа.
 * @returns true, если узел учитывается в разделе защитных аппаратов.
 */
function isDeviceBomKind(kind: GraphNode['kind']): kind is DeviceBomKind {
    return DEVICE_BOM_KINDS.has(kind);
}

/**
 * Оценить длину кабельной линии по полилинии точек трассы.
 * @param edge Ребро графа с точками трассы в пикселях подложки.
 * @param scaleMetersPerPx Масштаб плана, м/пикс; `null`, если масштаб не задан.
 * @returns Длина в метрах или 0, если масштаб/точки недоступны.
 */
function estimateEdgeLengthM(edge: GraphEdge, scaleMetersPerPx: number | null): number {
    const waypoints = edge.waypointsPx;
    if (waypoints === undefined || waypoints.length < 2 || scaleMetersPerPx === null) {
        return 0;
    }
    let lengthPx = 0;
    for (let index = 1; index < waypoints.length; index += 1) {
        const previous = waypoints[index - 1];
        const current = waypoints[index];
        if (previous === undefined || current === undefined) {
            continue;
        }
        lengthPx += Math.hypot(current.x - previous.x, current.y - previous.y);
    }
    return lengthPx * scaleMetersPerPx;
}

/**
 * Сформировать артикул защитного аппарата из типа УГО и номинального тока.
 * @param kind Тип узла-аппарата.
 * @param currentA Номинальный ток узла, А.
 * @returns Артикул изделия.
 */
function deviceArticle(kind: DeviceBomKind, currentA: number): string {
    switch (kind) {
        case 'circuit_breaker':
            return `IEK C${currentA} 1P`;
        case 'rcd':
            return `IEK УЗО ${currentA}А ${DEFAULT_RCD_CURRENT_MA}мА`;
        case 'rcbo':
            return `IEK АВДТ ${currentA}А ${DEFAULT_RCD_CURRENT_MA}мА`;
        case 'relay_voltage':
            return `IEK реле напряжения ${currentA}А`;
        case 'contactor':
            return `IEK контактор ${currentA}А`;
        case 'panel':
            return `IEK щит НКУ ${currentA}А`;
        case 'input_source':
            return `IEK ввод ${currentA}А`;
        default:
            return `IEK ${currentA}А`;
    }
}

/**
 * Построить спецификацию кабелей и защитных аппаратов из канонического графа.
 *
 * Линии группируются по марке, сечению, числу жил и материалу; длины берутся
 * из `cableSpecs.length`, а при нулевой сумме оцениваются по точкам трассы
 * и масштабу плана (RULES § 5.2, § 5.3).
 *
 * @param graph Канонический граф проекта — единственный источник истины.
 * @returns Две группы строк спецификации: кабели и защитные аппараты.
 */
export function buildBomRows(graph: ProjectGraph): { cables: BomRow[]; devices: BomRow[] } {
    const cableGroups = new Map<string, {
        brand: string;
        crossSection: number;
        conductorCount: number;
        material: 'cu' | 'al';
        edges: GraphEdge[];
    }>();

    for (const edge of graph.edges) {
        const brand = edge.cableBrand ?? DEFAULT_CABLE_BRAND;
        const { crossSection, conductorCount, material } = edge.cableSpecs;
        const key = `${brand}|${crossSection}|${conductorCount}|${material}`;
        const group = cableGroups.get(key);
        if (group === undefined) {
            cableGroups.set(key, { brand, crossSection, conductorCount, material, edges: [edge] });
        } else {
            group.edges.push(edge);
        }
    }

    const scaleMetersPerPx = graph.floorPlan.scaleMetersPerPx;
    const cables: BomRow[] = [];
    for (const group of cableGroups.values()) {
        let lengthM = group.edges.reduce((sum, edge) => sum + edge.cableSpecs.length, 0);
        if (lengthM === 0) {
            lengthM = group.edges.reduce(
                (sum, edge) => sum + estimateEdgeLengthM(edge, scaleMetersPerPx),
                0,
            );
        }
        const priceRub = CABLE_PRICE_RUB_PER_M[group.crossSection] ?? DEFAULT_CABLE_PRICE_RUB_PER_M;
        const designation = `${group.conductorCount}x${group.crossSection}`;
        const articleBrand = group.material === 'al' ? ALUMINUM_ARTICLE_BRAND : DEFAULT_CABLE_BRAND;
        cables.push({
            name: `${group.brand} ${designation}`,
            quantity: group.edges.length,
            lengthM,
            article: `${articleBrand} ${designation}`,
            priceRub,
            totalRub: roundMoney(priceRub * lengthM),
            sourceId: group.edges[0]?.id,
        });
    }

    const devices: BomRow[] = [];
    for (const node of graph.nodes) {
        if (!isDeviceBomKind(node.kind)) {
            continue;
        }
        const priceRub = DEVICE_PRICE_RUB[node.kind];
        devices.push({
            name: node.label,
            quantity: 1,
            lengthM: null,
            article: deviceArticle(node.kind, node.specs.ratedCurrent),
            priceRub,
            totalRub: roundMoney(priceRub),
            sourceId: node.id,
        });
    }

    return { cables, devices };
}

/**
 * Привести число к строке CSV с десятичной запятой.
 * @param value Числовое значение.
 * @returns Строка с разделителем «,».
 */
function csvNumber(value: number): string {
    return String(value).replace('.', ',');
}

/**
 * Экранировать ячейку CSV.
 * @param value Значение ячейки.
 * @returns Значение, заключённое в кавычки при наличии разделителя или кавычек.
 */
function escapeCsvCell(value: string): string {
    return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Добавить расширение к имени файла, если оно отсутствует.
 * @param fileName Имя файла.
 * @param extension Расширение вместе с точкой, например `.csv`.
 * @returns Имя файла с расширением.
 */
function withExtension(fileName: string, extension: string): string {
    return fileName.toLowerCase().endsWith(extension) ? fileName : `${fileName}${extension}`;
}

/**
 * Экспортировать спецификацию в CSV с BOM и разделителем «;».
 * @param rows Строки спецификации.
 * @param fileName Имя файла (расширение `.csv` добавляется при необходимости).
 * @param headers Локализованные заголовки в порядке: имя, количество, длина, артикул, цена, сумма.
 * @returns Promise, разрешающийся после инициации скачивания.
 */
export async function exportBomCsvAsync(
    rows: BomRow[],
    fileName: string,
    headers: readonly string[] = DEFAULT_CSV_HEADERS,
): Promise<void> {
    const lines: string[] = [headers.map(escapeCsvCell).join(';')];
    for (const row of rows) {
        lines.push([
            row.name,
            String(row.quantity),
            row.lengthM === null ? '' : csvNumber(row.lengthM),
            row.article,
            csvNumber(row.priceRub),
            csvNumber(row.totalRub),
        ].map(escapeCsvCell).join(';'));
    }
    const content = `\uFEFF${lines.join('\r\n')}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = withExtension(fileName, '.csv');
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    await Promise.resolve();
}

/**
 * Экспортировать спецификацию в книгу XLSX.
 * @param rows Строки спецификации.
 * @param fileName Имя файла (расширение `.xlsx` добавляется при необходимости).
 * @param headers Локализованные заголовки в порядке: имя, количество, длина, артикул, цена, сумма.
 * @returns Promise, разрешающийся после инициации скачивания.
 */
export async function exportBomXlsxAsync(
    rows: BomRow[],
    fileName: string,
    headers: string[],
): Promise<void> {
    const XLSX = await import('xlsx');
    const matrix: (string | number)[][] = [
        headers,
        ...rows.map((row) => [
            row.name,
            row.quantity,
            row.lengthM ?? '',
            row.article,
            row.priceRub,
            row.totalRub,
        ]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Спецификация');
    XLSX.writeFile(workbook, withExtension(fileName, '.xlsx'));
    await Promise.resolve();
}
