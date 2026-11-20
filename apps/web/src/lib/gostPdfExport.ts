// © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
/**
 * Формирование комплекта документации РД по ГОСТ Р 21.101 в формате PDF.
 *
 * Правила § 5.2: все данные берутся только из канонического ProjectGraph.
 * Правила § 5.4: генерация полностью клиентская, без обращений к серверу.
 * Кириллица отрисовывается системным шрифтом в HTMLCanvasElement, а готовый
 * растр встраивается в jsPDF — встроенные шрифты jsPDF не содержат кириллицу.
 */
import type {
    GraphEdge,
    GraphNode,
    NodeKind,
    Point,
    ProjectGraph,
    StampMeta,
} from '@voltwirecraft/shared/graph.schema.js';
import {
    DIN_MODULE_WIDTH_MM,
    RAIL_MODULES,
    moduleWidthModules,
    phaseColor,
    phaseForSlot,
    ratingLabel,
} from '../lib/panelModules.js';

/** Ширина страницы A4 альбомной ориентации, мм. */
const PAGE_WIDTH_MM = 297;
/** Высота страницы A4 альбомной ориентации, мм. */
const PAGE_HEIGHT_MM = 210;
/** Ширина растра в пикселях (масштаб ~2 относительно базового A4). */
const CANVAS_WIDTH_PX = 2480;
/** Высота растра в пикселях с сохранением пропорций A4. */
const CANVAS_HEIGHT_PX = 1754;
/** Перевод миллиметров чертежа в пиксели растра. */
const MM_TO_PX = CANVAS_WIDTH_PX / PAGE_WIDTH_MM;
/** Число листов комплекта. */
const TOTAL_SHEETS = 4;
/** Левая граница основной области чертежа, мм. */
const CONTENT_LEFT = 25;
/** Правая граница основной области чертежа, мм. */
const CONTENT_RIGHT = 288;
/** Верхняя граница основной области чертежа, мм. */
const CONTENT_TOP = 28;
/** Нижняя граница основной области чертежа (над штампом), мм. */
const CONTENT_BOTTOM = 146;
/** Ширина основной области чертежа, мм. */
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
/** Координата X основной надписи, мм. */
const STAMP_X = 112;
/** Координата Y основной надписи, мм. */
const STAMP_Y = 150;
/** Ширина основной надписи, мм. */
const STAMP_WIDTH = 180;
/** Высота основной надписи, мм. */
const STAMP_HEIGHT = 55;

/** Заголовки листов комплекта в порядке следования. */
const SHEET_TITLES: readonly string[] = [
    'Общие данные',
    'Однолинейная схема',
    'Компоновка щита НКУ',
    'Кабельный журнал и Спецификация оборудования',
];

/** Русскоязычные наименования типов УГО для спецификации. */
const KIND_LABELS: Readonly<Record<NodeKind, string>> = {
    input_source: 'Вводный источник',
    panel: 'Щит НКУ',
    circuit_breaker: 'Автоматический выключатель',
    rcd: 'УЗО',
    rcbo: 'АВДТ',
    relay_voltage: 'Реле напряжения',
    contactor: 'Контактор',
    socket: 'Розетка',
    light_fixture: 'Светильник',
    switch: 'Выключатель',
    appliance: 'Прибор',
};

/** Группы УГО для однолинейной схемы. */
type DiagramGroup = 'source' | 'protection' | 'consumer';

/** Параметры текста основной надписи и таблиц. */
interface TextOptions {
    /** Цвет текста. */
    color?: string;
    /** Полужирное начертание. */
    bold?: boolean;
    /** Выравнивание относительно опорной точки. */
    align?: CanvasTextAlign;
}

/** Параметры прямоугольника. */
interface RectOptions {
    /** Цвет контура. */
    stroke?: string;
    /** Цвет заливки. */
    fill?: string;
    /** Прозрачность заливки (0…1). */
    fillOpacity?: number;
    /** Толщина контура, мм. */
    lineWidthMm?: number;
}

/** Набор примитивов для рисования в миллиметрах страницы. */
interface Painter {
    /** Вывести текст; координата Y — базовая линия. */
    text(value: string, xMm: number, yMm: number, sizeMm: number, options?: TextOptions): void;
    /** Провести отрезок. */
    line(x1Mm: number, y1Mm: number, x2Mm: number, y2Mm: number, color: string, widthMm?: number): void;
    /** Нарисовать прямоугольник. */
    rect(xMm: number, yMm: number, widthMm: number, heightMm: number, options?: RectOptions): void;
    /** Измерить ширину текста в миллиметрах страницы. */
    measure(value: string, sizeMm: number, bold?: boolean): number;
}

/** Описание столбца таблицы. */
interface TableColumn {
    /** Заголовок столбца. */
    title: string;
    /** Относительная ширина. */
    weight: number;
    /** Выравнивание содержимого. */
    align?: CanvasTextAlign;
}

/** Строка агрегированной спецификации оборудования. */
interface SpecRow {
    /** Наименование позиции. */
    name: string;
    /** Количество. */
    quantity: number;
    /** Максимальный номинальный ток одной позиции, А. */
    currentA: number;
    /** Суммарная номинальная мощность, Вт. */
    powerW: number;
}

/** Размещённый на рейке модуль щита. */
interface PanelPlacement {
    /** Узел графа со слотом щита. */
    node: GraphNode & { panelSlot: number };
    /** Координата X левого края, мм. */
    x: number;
    /** Координата Y верхнего края, мм. */
    y: number;
    /** Ширина модуля, мм (масштабированная). */
    width: number;
    /** Высота модуля, мм. */
    height: number;
}

/**
 * Безопасное строковое значение: пустое значение заменяется прочерком.
 * @param value Исходная строка.
 * @returns Непустая строка для вывода в документ.
 */
function valueOrDash(value: string | undefined): string {
    if (value === undefined || value.trim().length === 0) {
        return '—';
    }
    return value.trim();
}

/**
 * Форматировать число с двумя знаками после запятой.
 * @param value Числовое значение.
 * @returns Строка с десятичной запятой.
 */
function formatNumber(value: number): string {
    if (!Number.isFinite(value)) {
        return '—';
    }
    return value.toFixed(2).replace('.', ',');
}

/**
 * Площадь многоугольника по формуле шнуровки, м².
 * @param polygon Вершины полигона в метрах.
 * @returns Модуль площади или 0 для вырожденного контура.
 */
function polygonAreaM2(polygon: readonly Point[]): number {
    if (polygon.length < 3) {
        return 0;
    }
    let twiceArea = 0;
    for (let index = 0; index < polygon.length; index += 1) {
        const current = polygon[index];
        const next = polygon[(index + 1) % polygon.length];
        if (current === undefined || next === undefined) {
            continue;
        }
        twiceArea += current.x * next.y - next.x * current.y;
    }
    const area = Math.abs(twiceArea) / 2;
    return Number.isFinite(area) ? area : 0;
}

/**
 * Суммарная площадь помещений проекта, м².
 * @param graph Канонический граф проекта.
 * @returns Сумма площадей полигонов помещений.
 */
function totalFloorAreaM2(graph: ProjectGraph): number {
    return graph.rooms.reduce((sum, room) => sum + polygonAreaM2(room.polygon), 0);
}

/**
 * Длина кабельной линии: заявленная длина либо длина полилинии waypointsM.
 * Вычисление детерминированное (геометрия), без физических расчётов.
 * @param edge Ребро графа.
 * @returns Длина в метрах или 0, если длину определить нельзя.
 */
function cableLengthM(edge: GraphEdge): number {
    const declared = edge.cableSpecs.length;
    if (Number.isFinite(declared) && declared > 0) {
        return declared;
    }
    const points = edge.waypointsM;
    if (!Array.isArray(points) || points.length < 2) {
        return 0;
    }
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        if (previous === undefined || current === undefined) {
            continue;
        }
        length += Math.hypot(current.x - previous.x, current.y - previous.y);
    }
    return Number.isFinite(length) && length > 0 ? length : 0;
}

/**
 * Создать набор примитивов рисования поверх 2D-контекста canvas.
 * Все публичные методы принимают координаты в миллиметрах страницы.
 * @param ctx 2D-контекст растра страницы.
 * @returns Набор функций text/line/rect/measure.
 */
function createPainter(ctx: CanvasRenderingContext2D): Painter {
    const toPx = (valueMm: number): number => valueMm * MM_TO_PX;
    const buildFont = (sizeMm: number, bold: boolean): string => {
        const sizePx = Math.max(1, toPx(sizeMm));
        return `${bold ? '700' : '400'} ${sizePx}px 'Roboto', 'Arial', sans-serif`;
    };

    const text = (
        value: string,
        xMm: number,
        yMm: number,
        sizeMm: number,
        options: TextOptions = {},
    ): void => {
        ctx.save();
        ctx.font = buildFont(sizeMm, options.bold ?? false);
        ctx.fillStyle = options.color ?? '#0f172a';
        ctx.textAlign = options.align ?? 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(value, toPx(xMm), toPx(yMm));
        ctx.restore();
    };

    const line = (
        x1Mm: number,
        y1Mm: number,
        x2Mm: number,
        y2Mm: number,
        color: string,
        widthMm: number = 0.3,
    ): void => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, toPx(widthMm));
        ctx.beginPath();
        ctx.moveTo(toPx(x1Mm), toPx(y1Mm));
        ctx.lineTo(toPx(x2Mm), toPx(y2Mm));
        ctx.stroke();
        ctx.restore();
    };

    const rect = (
        xMm: number,
        yMm: number,
        widthMm: number,
        heightMm: number,
        options: RectOptions = {},
    ): void => {
        const x = toPx(xMm);
        const y = toPx(yMm);
        const width = Math.max(1, toPx(widthMm));
        const height = Math.max(1, toPx(heightMm));
        if (options.fill !== undefined) {
            ctx.save();
            ctx.globalAlpha = options.fillOpacity ?? 1;
            ctx.fillStyle = options.fill;
            ctx.fillRect(x, y, width, height);
            ctx.restore();
        }
        if (options.stroke !== undefined) {
            ctx.save();
            ctx.strokeStyle = options.stroke;
            ctx.lineWidth = Math.max(1, toPx(options.lineWidthMm ?? 0.3));
            ctx.strokeRect(x, y, width, height);
            ctx.restore();
        }
    };

    const measure = (value: string, sizeMm: number, bold: boolean = false): number => {
        ctx.save();
        ctx.font = buildFont(sizeMm, bold);
        const widthPx = ctx.measureText(value).width;
        ctx.restore();
        return widthPx / MM_TO_PX;
    };

    return { text, line, rect, measure };
}

/**
 * Создать чистый растр страницы с белым фоном.
 * @returns HTMLCanvasElement заданного размера.
 * @throws Если 2D-контекст недоступен.
 */
function createPageCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH_PX;
    canvas.height = CANVAS_HEIGHT_PX;
    const context = canvas.getContext('2d');
    if (context === null) {
        throw new Error('Не удалось получить 2D-контекст canvas для документа ГОСТ');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, CANVAS_WIDTH_PX, CANVAS_HEIGHT_PX);
    return canvas;
}

/**
 * Нарисовать рамку листа по ГОСТ Р 21.101 (внешняя и внутренняя).
 * @param painter Примитивы рисования страницы.
 */
function drawFrame(painter: Painter): void {
    painter.rect(5, 5, PAGE_WIDTH_MM - 10, PAGE_HEIGHT_MM - 10, {
        stroke: '#0f172a',
        lineWidthMm: 0.5,
    });
    painter.rect(20, 5, PAGE_WIDTH_MM - 25, PAGE_HEIGHT_MM - 10, {
        stroke: '#0f172a',
        lineWidthMm: 0.35,
    });
}

/**
 * Нарисовать заголовок листа и его номер.
 * @param painter Примитивы рисования страницы.
 * @param title Название листа.
 * @param sheetNumber Порядковый номер листа.
 */
function drawPageHeader(painter: Painter, title: string, sheetNumber: number): void {
    painter.text(title, CONTENT_LEFT, 22, 6, { bold: true });
    painter.text(`Лист ${sheetNumber} из ${TOTAL_SHEETS}`, CONTENT_RIGHT, 22, 3.5, {
        align: 'right',
    });
    painter.line(CONTENT_LEFT, 24, CONTENT_RIGHT, 24, '#0f172a', 0.4);
}

/**
 * Нарисовать основную надпись (штамп) в правом нижнем углу листа.
 * Вызывается для всех четырёх листов с одинаковыми реквизитами.
 * @param painter Примитивы рисования страницы.
 * @param stamp Реквизиты штампа.
 * @param graphName Название объекта (проекта).
 * @param sheetNumber Номер листа.
 * @param date Дата выпуска.
 */
function drawStamp(
    painter: Painter,
    stamp: StampMeta,
    graphName: string,
    sheetNumber: number,
    date: string,
): void {
    painter.rect(STAMP_X, STAMP_Y, STAMP_WIDTH, STAMP_HEIGHT, {
        stroke: '#0f172a',
        lineWidthMm: 0.5,
    });

    /** Внутренняя ячейка с подписью и значением. */
    const cell = (
        x: number,
        y: number,
        width: number,
        height: number,
        caption: string,
        value: string,
    ): void => {
        painter.rect(x, y, width, height, { stroke: '#0f172a', lineWidthMm: 0.25 });
        painter.text(caption, x + 1.5, y + 3, 2.6, { color: '#475569' });
        painter.text(value, x + 1.5, y + height - 1.8, 3.2, { bold: true });
    };

    const row1 = STAMP_Y;
    const row2 = STAMP_Y + 7;
    const row3 = STAMP_Y + 20;
    const row4 = STAMP_Y + 27;
    const row5 = STAMP_Y + 40;

    cell(STAMP_X, row1, 120, 7, 'Шифр проекта', valueOrDash(stamp.projectCode));
    cell(STAMP_X + 120, row1, 60, 7, 'Лист', String(sheetNumber));

    cell(STAMP_X, row2, 135, 13, 'Объект', valueOrDash(graphName));
    cell(STAMP_X + 135, row2, 45, 13, 'Стадия', valueOrDash(stamp.stage ?? 'РД'));

    cell(STAMP_X, row3, 180, 7, 'Организация', valueOrDash(stamp.organizationName));

    cell(STAMP_X, row4, 60, 13, 'Разработал', valueOrDash(stamp.designerName));
    cell(STAMP_X + 60, row4, 60, 13, 'Проверил', valueOrDash(stamp.reviewerName));
    cell(STAMP_X + 120, row4, 60, 13, 'Дата', date);

    cell(STAMP_X, row5, 120, 15, 'Всего листов', String(TOTAL_SHEETS));
    cell(STAMP_X + 120, row5, 60, 15, 'Формат', 'А4');
}

/**
 * Нарисовать таблицу с автоматическим подбором высоты строк.
 * @param painter Примитивы рисования страницы.
 * @param x Левый край таблицы, мм.
 * @param y Верхний край таблицы, мм.
 * @param width Ширина таблицы, мм.
 * @param maxHeight Максимальная высота таблицы, мм.
 * @param columns Описание столбцов.
 * @param rows Строки (не пустой массив; пустые данные передаются как «—»).
 * @returns Координата Y нижнего края таблицы, мм.
 */
function drawTable(
    painter: Painter,
    x: number,
    y: number,
    width: number,
    maxHeight: number,
    columns: readonly TableColumn[],
    rows: readonly (readonly string[])[],
): number {
    const headerHeight = 7;
    const rowCount = Math.max(1, rows.length);
    const availableForRows = Math.max(4, maxHeight - headerHeight);
    const rowHeight = Math.min(8, Math.max(3.2, availableForRows / rowCount));
    const weightSum = columns.reduce((sum, column) => sum + column.weight, 0) || 1;
    const widths = columns.map((column) => (width * column.weight) / weightSum);
    let cursorX = x;

    painter.rect(x, y, width, headerHeight, { fill: '#e2e8f0', stroke: '#334155', lineWidthMm: 0.25 });
    columns.forEach((column, index) => {
        const columnWidth = widths[index] ?? 0;
        const align = column.align ?? 'left';
        const textX = align === 'right'
            ? cursorX + columnWidth - 1.5
            : align === 'center'
                ? cursorX + columnWidth / 2
                : cursorX + 1.5;
        const fontSize = Math.min(3.2, Math.max(2.2, headerHeight * 0.45));
        painter.text(column.title, textX, y + headerHeight / 2 + fontSize * 0.35, fontSize, {
            bold: true,
            align,
        });
        cursorX += columnWidth;
    });
    painter.line(x, y + headerHeight, x + width, y + headerHeight, '#334155', 0.3);

    rows.forEach((row, rowIndex) => {
        const rowTop = y + headerHeight + rowIndex * rowHeight;
        if (rowIndex % 2 === 1) {
            painter.rect(x, rowTop, width, rowHeight, { fill: '#f8fafc' });
        }
        painter.rect(x, rowTop, width, rowHeight, { stroke: '#94a3b8', lineWidthMm: 0.2 });
        let cellX = x;
        columns.forEach((column, index) => {
            const columnWidth = widths[index] ?? 0;
            const align = column.align ?? 'left';
            const value = row[index] ?? '—';
            const textX = align === 'right'
                ? cellX + columnWidth - 1.5
                : align === 'center'
                    ? cellX + columnWidth / 2
                    : cellX + 1.5;
            const fontSize = Math.min(3.4, Math.max(2.2, rowHeight * 0.5));
            painter.text(value, textX, rowTop + rowHeight / 2 + fontSize * 0.35, fontSize, { align });
            if (index > 0) {
                painter.line(cellX, rowTop, cellX, rowTop + rowHeight, '#cbd5e1', 0.15);
            }
            cellX += columnWidth;
        });
    });

    return y + headerHeight + rowCount * rowHeight;
}

/**
 * Лист 1 «Общие данные»: параметры проекта и нормативные примечания.
 * @param painter Примитивы рисования страницы.
 * @param graph Канонический граф проекта.
 * @param stamp Реквизиты штампа.
 */
function drawSheet1(painter: Painter, graph: ProjectGraph, stamp: StampMeta): void {
    const ceiling = graph.floorPlan.ceilingHeightM;
    const rows: readonly (readonly string[])[] = [
        ['Наименование проекта', graph.name],
        ['Версия схемы (schemaVersion)', String(graph.schemaVersion)],
        ['Помещения', String(graph.rooms.length)],
        ['Стены и проёмы', String(graph.walls.length)],
        ['Узлы графа', String(graph.nodes.length)],
        ['Кабельные линии', String(graph.edges.length)],
        ['Суммарная площадь помещений, м²', formatNumber(totalFloorAreaM2(graph))],
        ['Высота потолка, м', Number.isFinite(ceiling) ? formatNumber(ceiling) : '—'],
        ['Стадия', valueOrDash(stamp.stage ?? 'РД')],
        ['Организация', valueOrDash(stamp.organizationName)],
    ];
    drawTable(
        painter,
        CONTENT_LEFT,
        CONTENT_TOP + 4,
        160,
        82,
        [
            { title: 'Параметр', weight: 58 },
            { title: 'Значение', weight: 42 },
        ],
        rows,
    );

    const noteX = CONTENT_LEFT + 166;
    const noteWidth = CONTENT_WIDTH - 166;
    painter.rect(noteX, CONTENT_TOP + 4, noteWidth, 82, { fill: '#f8fafc', stroke: '#94a3b8' });
    painter.text('Примечания', noteX + 3, CONTENT_TOP + 12, 4, { bold: true });
    const notes: readonly string[] = [
        '1. Проект выполнен по требованиям',
        '   ПУЭ-7 (издание 7).',
        '2. Оформление чертежей — по',
        '   ГОСТ Р 21.101 (СПДС).',
        '3. Электротехнические параметры',
        '   определены детерминированным',
        '   ядром из канонического графа.',
        '4. Все величины приведены в СИ.',
    ];
    notes.forEach((note, index) => {
        painter.text(note, noteX + 3, CONTENT_TOP + 20 + index * 7, 3.2);
    });

    painter.text('Состав комплекта: 4 листа формата А4, альбомная ориентация.',
        CONTENT_LEFT, 131, 3.4, { color: '#334155' });
    painter.text('Расчётные значения носят справочный характер и подлежат проверке.',
        CONTENT_LEFT, 138, 3.4, { color: '#334155' });
}

/**
 * Определить группу УГО для однолинейной схемы.
 * @param node Узел графа.
 * @returns Группа: источник, защитный аппарат или потребитель.
 */
function diagramGroup(node: GraphNode): DiagramGroup {
    if (node.kind === 'input_source' || node.kind === 'panel') {
        return 'source';
    }
    if (
        node.kind === 'circuit_breaker' ||
        node.kind === 'rcd' ||
        node.kind === 'rcbo' ||
        node.kind === 'relay_voltage' ||
        node.kind === 'contactor'
    ) {
        return 'protection';
    }
    return 'consumer';
}

/**
 * Легенда однолинейной схемы.
 * @param painter Примитивы рисования страницы.
 * @param y Координата Y верхней строки легенды, мм.
 */
function drawDiagramLegend(painter: Painter, y: number): void {
    painter.line(CONTENT_LEFT, y - 4, CONTENT_RIGHT, y - 4, '#cbd5e1', 0.25);
    painter.text('Условные обозначения:', CONTENT_LEFT, y + 3, 3.2, { bold: true });
    painter.text('Прямоугольник — УГО узла; линия — ребро графа (кабельная трасса).',
        CONTENT_LEFT + 52, y + 3, 3.2);
    painter.text('C<n> — номинал автомата; «<n>А 30мА» — уставка УЗО/АВДТ; P — мощность, Вт; I — ток, А.',
        CONTENT_LEFT, y + 10, 3.2, { color: '#475569' });
}

/**
 * Лист 2 «Однолинейная схема»: электрическая иерархия из узлов и рёбер графа.
 * @param painter Примитивы рисования страницы.
 * @param graph Канонический граф проекта.
 */
function drawSheet2(painter: Painter, graph: ProjectGraph): void {
    if (graph.nodes.length === 0) {
        painter.text('—', (CONTENT_LEFT + CONTENT_RIGHT) / 2, 80, 8, { align: 'center' });
        painter.text('Данные для построения схемы отсутствуют',
            (CONTENT_LEFT + CONTENT_RIGHT) / 2, 90, 4, { align: 'center', color: '#64748b' });
        drawDiagramLegend(painter, 130);
        return;
    }

    const groups: Record<DiagramGroup, GraphNode[]> = {
        source: [],
        protection: [],
        consumer: [],
    };
    for (const node of graph.nodes) {
        groups[diagramGroup(node)].push(node);
    }

    const columns: readonly { group: DiagramGroup; x: number; width: number; title: string }[] = [
        { group: 'source', x: 28, width: 58, title: 'Источник / щит' },
        { group: 'protection', x: 105, width: 62, title: 'Аппараты защиты' },
        { group: 'consumer', x: 188, width: 74, title: 'Потребители' },
    ];
    const largestGroup = Math.max(...columns.map((column) => groups[column.group].length));
    const maxCount = Math.max(1, largestGroup);
    const spacing = Math.min(20, Math.max(6, 88 / maxCount));
    const boxHeight = Math.max(6, Math.min(12, spacing - 2));
    const top = 36;

    /** Позиция узла на схеме или undefined для неизвестного узла. */
    const positionOf = (nodeId: string): { x: number; y: number; width: number } | undefined => {
        const node = graph.nodes.find((item) => item.id === nodeId);
        if (node === undefined) {
            return undefined;
        }
        const group = diagramGroup(node);
        const column = columns.find((item) => item.group === group);
        if (column === undefined) {
            return undefined;
        }
        const index = groups[group].findIndex((item) => item.id === nodeId);
        if (index < 0) {
            return undefined;
        }
        return { x: column.x, y: top + index * spacing, width: column.width };
    };

    // Соединители выводятся только из рёбер канонического графа.
    for (const edge of graph.edges) {
        const from = positionOf(edge.from);
        const to = positionOf(edge.to);
        if (from === undefined || to === undefined) {
            continue;
        }
        const x1 = from.x + from.width;
        const y1 = from.y + boxHeight / 2;
        const x2 = to.x;
        const y2 = to.y + boxHeight / 2;
        const middle = (x1 + x2) / 2;
        painter.line(x1, y1, middle, y1, '#475569', 0.35);
        painter.line(middle, y1, middle, y2, '#475569', 0.35);
        painter.line(middle, y2, x2, y2, '#475569', 0.35);
    }

    columns.forEach((column) => {
        painter.text(column.title, column.x + column.width / 2, 31, 3.6, {
            bold: true,
            align: 'center',
        });
        groups[column.group].forEach((node, index) => {
            const y = top + index * spacing;
            painter.rect(column.x, y, column.width, boxHeight, {
                fill: '#f8fafc',
                stroke: '#334155',
                lineWidthMm: 0.3,
            });
            const fontSize = Math.min(3.2, Math.max(2.2, boxHeight * 0.3));
            painter.text(node.label, column.x + 2, y + fontSize + 1.5, fontSize, { bold: true });
            const detail = `${ratingLabel(node)} · P=${formatNumber(node.specs.ratedPower)} Вт · I=${formatNumber(node.specs.ratedCurrent)} А`;
            painter.text(detail, column.x + 2, y + boxHeight - 2, Math.max(2, fontSize - 0.5), {
                color: '#475569',
            });
        });
    });

    drawDiagramLegend(painter, 133);
}

/**
 * Лист 3 «Компоновка щита НКУ»: DIN-рейки, модули и шины N/PE.
 * @param painter Примитивы рисования страницы.
 * @param graph Канонический граф проекта.
 */
function drawSheet3(painter: Painter, graph: ProjectGraph): void {
    const slotted = graph.nodes
        .filter((node): node is GraphNode & { panelSlot: number } => node.panelSlot !== null)
        .sort((left, right) => left.panelSlot - right.panelSlot);

    const usedModules = slotted.reduce((sum, node) => sum + moduleWidthModules(node), 0);
    const enclosureModules = Math.ceil(usedModules * 1.2);

    // Число рядов определяется укладкой модулей ёмкостью RAIL_MODULES.
    let packedRails = 0;
    let slotWithinRail = 0;
    for (const node of slotted) {
        const width = moduleWidthModules(node);
        if (packedRails === 0 || slotWithinRail + width > RAIL_MODULES) {
            packedRails += 1;
            slotWithinRail = 0;
        }
        slotWithinRail += width;
    }

    const enclosureX = 32;
    const enclosureY = 30;
    const enclosureWidth = 220;
    const maxEnclosureBottom = 104;
    const rowStep = packedRails === 0
        ? 18
        : Math.min(18, Math.max(6, (maxEnclosureBottom - enclosureY - 16) / packedRails));
    const moduleHeight = Math.max(5, rowStep - 4);
    const visualScale = Math.min(1, (enclosureWidth - 20)
        / (Math.max(enclosureModules, 1) * DIN_MODULE_WIDTH_MM));
    const enclosureHeight = Math.max(46, packedRails * rowStep + 14);
    const enclosureBottom = enclosureY + enclosureHeight;

    painter.rect(enclosureX, enclosureY, enclosureWidth, enclosureHeight, {
        fill: '#f1f5f9',
        stroke: '#334155',
        lineWidthMm: 0.5,
    });

    if (slotted.length === 0) {
        painter.text('—', enclosureX + enclosureWidth / 2, enclosureY + enclosureHeight / 2, 6, {
            align: 'center',
        });
        painter.text('В графе нет модулей с назначенным слотом щита',
            enclosureX + enclosureWidth / 2, enclosureY + enclosureHeight / 2 + 9, 3.4, {
                align: 'center',
                color: '#64748b',
            });
    }

    const placements: PanelPlacement[] = [];
    let currentRail = 0;
    let currentSlot = 0;
    for (const node of slotted) {
        const widthModules = moduleWidthModules(node);
        if (currentRail > 0 && currentSlot + widthModules > RAIL_MODULES) {
            currentRail += 1;
            currentSlot = 0;
        }
        placements.push({
            node,
            x: enclosureX + 10 + currentSlot * DIN_MODULE_WIDTH_MM * visualScale,
            y: enclosureY + 8 + currentRail * rowStep,
            width: widthModules * DIN_MODULE_WIDTH_MM * visualScale,
            height: moduleHeight,
        });
        currentSlot += widthModules;
    }

    for (let rail = 0; rail < packedRails; rail += 1) {
        const railY = enclosureY + 7 + rail * rowStep;
        painter.line(enclosureX + 8, railY, enclosureX + enclosureWidth - 8, railY, '#64748b', 0.4);
        painter.line(enclosureX + 8, railY + moduleHeight + 2,
            enclosureX + enclosureWidth - 8, railY + moduleHeight + 2, '#64748b', 0.4);
        painter.text(`DIN-${rail + 1}`, enclosureX + enclosureWidth - 12, railY - 1.5, 2.8, {
            align: 'right',
            color: '#64748b',
        });
    }

    for (const placement of placements) {
        const phase = phaseForSlot(placement.node.panelSlot);
        const color = phaseColor(phase);
        painter.rect(placement.x, placement.y, placement.width, placement.height, {
            fill: color,
            fillOpacity: 0.3,
            stroke: color,
            lineWidthMm: 0.35,
        });
        const fontSize = Math.min(3, Math.max(2, placement.width * 0.22));
        painter.text(ratingLabel(placement.node),
            placement.x + placement.width / 2,
            placement.y + placement.height / 2 + fontSize * 0.35,
            fontSize,
            { align: 'center', bold: true });
        painter.text(phase,
            placement.x + placement.width / 2,
            placement.y + placement.height + 2,
            2.4,
            { align: 'center', color });
    }

    const busN = enclosureBottom + 8;
    const busPe = busN + 7;
    painter.line(enclosureX + 8, busN, enclosureX + enclosureWidth - 8, busN, '#2563eb', 0.7);
    painter.text('N', enclosureX, busN + 1, 3.2, { bold: true, color: '#2563eb' });
    painter.line(enclosureX + 8, busPe, enclosureX + enclosureWidth - 8, busPe, '#16a34a', 0.7);
    painter.text('PE', enclosureX, busPe + 1, 3.2, { bold: true, color: '#16a34a' });

    painter.rect(enclosureX, busPe + 8, enclosureWidth, 20, {
        fill: '#f8fafc',
        stroke: '#94a3b8',
        lineWidthMm: 0.25,
    });
    painter.text(`Занято DIN-модулей: ${usedModules} · Резерв 20% → корпус: ${enclosureModules} модулей`,
        enclosureX + 3, busPe + 16, 3.4, { bold: true });
    painter.text(`Ширина корпуса с резервом: ${formatNumber(enclosureModules * DIN_MODULE_WIDTH_MM)} мм · Рядов DIN: ${packedRails} · Шаг модуля ${DIN_MODULE_WIDTH_MM} мм`,
        enclosureX + 3, busPe + 24, 3.2, { color: '#475569' });
}

/**
 * Собрать агрегированную спецификацию оборудования из узлов графа.
 * @param nodes Узлы канонического графа.
 * @returns Строки спецификации.
 */
function buildSpecRows(nodes: readonly GraphNode[]): SpecRow[] {
    const groups = new Map<string, SpecRow>();
    for (const node of nodes) {
        const key = `${node.kind}|${node.label}`;
        const current = groups.get(key);
        if (current === undefined) {
            groups.set(key, {
                name: `${KIND_LABELS[node.kind]} · ${node.label}`,
                quantity: 1,
                currentA: node.specs.ratedCurrent,
                powerW: node.specs.ratedPower,
            });
        } else {
            current.quantity += 1;
            current.currentA = Math.max(current.currentA, node.specs.ratedCurrent);
            current.powerW += node.specs.ratedPower;
        }
    }
    return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name, 'ru'));
}

/**
 * Лист 4 «Кабельный журнал и Спецификация оборудования».
 * @param painter Примитивы рисования страницы.
 * @param graph Канонический граф проекта.
 */
function drawSheet4(painter: Painter, graph: ProjectGraph): void {
    const nodeById = new Map<string, GraphNode>(graph.nodes.map((node) => [node.id, node]));
    const cableRows: readonly (readonly string[])[] = graph.edges.length === 0
        ? [['—', '—', '—', '—', '—', '—']]
        : graph.edges.map((edge, index) => {
            const length = cableLengthM(edge);
            return [
                String(index + 1),
                valueOrDash(nodeById.get(edge.from)?.label),
                valueOrDash(nodeById.get(edge.to)?.label),
                valueOrDash(edge.cableBrand),
                `${edge.cableSpecs.conductorCount}×${formatNumber(edge.cableSpecs.crossSection)}`,
                length > 0 ? formatNumber(length) : '—',
            ];
        });

    painter.text('Кабельный журнал', CONTENT_LEFT, CONTENT_TOP + 2, 4.2, { bold: true });
    const cableBottom = drawTable(
        painter,
        CONTENT_LEFT,
        CONTENT_TOP + 4,
        CONTENT_WIDTH,
        58,
        [
            { title: '№', weight: 5, align: 'center' },
            { title: 'Откуда', weight: 20 },
            { title: 'Куда', weight: 20 },
            { title: 'Марка', weight: 22 },
            { title: 'Жилы×сечение', weight: 18 },
            { title: 'Длина, м', weight: 15, align: 'right' },
        ],
        cableRows,
    );

    const specTop = Math.min(cableBottom + 12, 92);
    const specRows = buildSpecRows(graph.nodes);
    const specData: (readonly string[])[] = specRows.length === 0
        ? [['—', '—', '—', '—']]
        : specRows.map((row) => [
            row.name,
            String(row.quantity),
            formatNumber(row.currentA),
            formatNumber(row.powerW),
        ]);
    const totalQuantity = specRows.reduce((sum, row) => sum + row.quantity, 0);
    const totalPower = specRows.reduce((sum, row) => sum + row.powerW, 0);
    specData.push(['Итого', String(totalQuantity), '—', formatNumber(totalPower)]);

    painter.text('Спецификация оборудования', CONTENT_LEFT, specTop + 2, 4.2, { bold: true });
    drawTable(
        painter,
        CONTENT_LEFT,
        specTop + 4,
        CONTENT_WIDTH,
        Math.max(16, CONTENT_BOTTOM - specTop - 6),
        [
            { title: 'Наименование', weight: 58 },
            { title: 'Кол-во', weight: 10, align: 'center' },
            { title: 'Ток, А', weight: 14, align: 'right' },
            { title: 'Мощность, Вт', weight: 18, align: 'right' },
        ],
        specData,
    );
}

/**
 * Сформировать имя файла из названия проекта.
 * @param graph Канонический граф проекта.
 * @returns Безопасное имя файла с расширением .pdf.
 */
function safeFileName(graph: ProjectGraph): string {
    const base = graph.name
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/[^\p{L}\p{N}_-]/gu, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `${base || 'project'}_GOST_RD.pdf`;
}

/**
 * Нарисовать содержимое одного листа комплекта.
 * @param painter Примитивы рисования страницы.
 * @param index Номер листа (начиная с нуля).
 * @param graph Канонический граф проекта.
 * @param stamp Реквизиты основной надписи.
 */
function drawSheetContent(
    painter: Painter,
    index: number,
    graph: ProjectGraph,
    stamp: StampMeta,
): void {
    switch (index) {
        case 0:
            drawSheet1(painter, graph, stamp);
            break;
        case 1:
            drawSheet2(painter, graph);
            break;
        case 2:
            drawSheet3(painter, graph);
            break;
        case 3:
            drawSheet4(painter, graph);
            break;
        default:
            break;
    }
}

/**
 * Сформировать четырёхлистовой PDF комплекта РД по ГОСТ Р 21.101 и скачать его.
 * Рендер каждой страницы выполняется в canvas системным шрифтом, что
 * гарантирует корректную кириллицу без встраивания шрифтов в jsPDF.
 * @param graph Канонический граф проекта — единственный источник данных.
 * @param stamp Реквизиты основной надписи, введённые пользователем.
 * @returns Promise, разрешающийся после инициации скачивания файла.
 */
export async function exportGostPdfAsync(graph: ProjectGraph, stamp: StampMeta): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const date = new Date().toLocaleDateString('ru-RU');

    for (let index = 0; index < TOTAL_SHEETS; index += 1) {
        const canvas = createPageCanvas();
        const context = canvas.getContext('2d');
        if (context === null) {
            throw new Error('Не удалось получить 2D-контекст canvas для документа ГОСТ');
        }
        const painter = createPainter(context);
        drawFrame(painter);
        drawPageHeader(painter, SHEET_TITLES[index] ?? 'Лист', index + 1);
        drawSheetContent(painter, index, graph, stamp);
        drawStamp(painter, stamp, graph.name, index + 1, date);

        if (index > 0) {
            pdf.addPage();
        }
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM);
    }

    pdf.save(safeFileName(graph));
    await Promise.resolve();
}
