// © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
/**
 * Детерминированные офлайн-предложения ИИ-копилота (RULES § 5.4).
 *
 * Если сервер недоступен, агент формирует предложение изменений графа локально.
 * Физические величины не вычисляются (RULES § 5.1): номиналы и сечения hanya
 * копируются из существующих данных графа, а заголовки и связи задаются декларативно.
 */
import {
    CABLE_LINE_EDGE_TYPE,
    GraphEdgeSchema,
    GraphNodeSchema,
    ProjectGraphSchema,
} from '@voltwirecraft/shared/graph.schema.js';
import type {
    GraphEdge,
    GraphNode,
    Point,
    ProjectGraph,
} from '@voltwirecraft/shared/graph.schema.js';
import type { CopilotChatResponse } from './aiContracts.js';

/** Пояснение ко всем локальным предложениям: расчёты не выполнялись (RULES § 5.1). */
const NO_CALC_NOTE =
    ' Расчёты физических величин не выполнялись: агент только предлагает изменения графа.';

/** Номинал по умолчанию, если в графе нет данных о токах. */
const DEFAULT_RATED_CURRENT = 16;
/** Сечение жилы по умолчанию для новых линий, мм². */
const DEFAULT_CROSS_SECTION = 2.5;
/** Марка кабеля по умолчанию для новых линий. */
const DEFAULT_CABLE_BRAND = 'ВВГнг(А)-LS';

/**
 * Собрать канонический ответ локального копилота.
 * @param reply — текст ответа на русском языке.
 * @param diffSummary — человекочитаемые изменения.
 * @param proposedGraph — предлагаемый граф; `undefined`, если изменений нет.
 * @returns ответ копилота с пустыми протоколом и цитатами.
 */
function makeResponse(
    reply: string,
    diffSummary: readonly string[],
    proposedGraph?: ProjectGraph,
): CopilotChatResponse {
    return {
        reply: proposedGraph === undefined ? reply : `${reply}${NO_CALC_NOTE}`,
        ...(proposedGraph === undefined ? {} : { proposedGraph }),
        diffSummary: [...diffSummary],
        toolCalls: [],
        citations: [],
    };
}

/**
 * Привести команду к нижнему регистру для регистронезависимого поиска.
 * @param message — исходный текст команды.
 * @returns нормализованный текст.
 */
function normalize(message: string): string {
    return message.toLowerCase();
}

/**
 * Проверить наличие любого из ключевых слов в тексте.
 * @param text — нормализованный текст.
 * @param keywords — ключевые слова.
 * @returns true, если найдено хотя бы одно ключевое слово.
 */
function matchesAny(text: string, keywords: readonly string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
}

/**
 * Создать узел автоматического выключателя с валидной спецификацией.
 * @param label — подпись нового узла.
 * @param panelSlot — свободный слот на DIN-рейке.
 * @param ratedCurrent — скопированный из графа номинал, А.
 * @param crossSection — скопированное из графа сечение жилы, мм².
 * @returns новый узел, прошедший каноническую валидацию.
 */
function createBreakerNode(
    label: string,
    panelSlot: number,
    ratedCurrent: number,
    crossSection: number,
): GraphNode {
    return GraphNodeSchema.parse({
        id: crypto.randomUUID(),
        kind: 'circuit_breaker',
        label,
        planPosition: null,
        panelSlot,
        specs: {
            ratedPower: 0,
            ratedCurrent: ratedCurrent > 0 ? ratedCurrent : DEFAULT_RATED_CURRENT,
            crossSection: crossSection > 0 ? crossSection : DEFAULT_CROSS_SECTION,
            mountingHeight: 0,
        },
        roomId: null,
        catalogDeviceId: null,
    });
}

/**
 * Клонировать кабельную линию с новыми идентификатором и конечными узлами.
 * @param graph — исходный граф (только для чтения).
 * @param template — линия-образец или `undefined`.
 * @param from — идентификатор нового исходного узла.
 * @param to — идентификатор нового конечного узла.
 * @returns валидная линия с минимум двумя точками трассы в метрах.
 */
function cloneEdge(
    graph: ProjectGraph,
    template: GraphEdge | undefined,
    from: string,
    to: string,
): GraphEdge {
    const fromNode = graph.nodes.find((node) => node.id === from);
    const toNode = graph.nodes.find((node) => node.id === to);
    const start: Point = fromNode?.planPosition ?? { x: 0, y: 0 };
    const end: Point = toNode?.planPosition ?? { x: 0, y: 0 };
    const cableSpecs = template === undefined
        ? {
              crossSection: DEFAULT_CROSS_SECTION,
              conductorCount: 3,
              material: 'cu',
              length: 0,
          }
        : { ...template.cableSpecs };
    const waypointsM: Point[] = template === undefined
        ? [{ x: start.x, y: start.y }, { x: end.x, y: end.y }]
        : template.waypointsM.map((point) => ({ x: point.x, y: point.y }));

    return GraphEdgeSchema.parse({
        id: crypto.randomUUID(),
        from,
        to,
        cableSpecs,
        waypointsM,
        ...(template?.waypointsPx === undefined
            ? {}
            : { waypointsPx: template.waypointsPx.map((point) => ({ x: point.x, y: point.y })) }),
        edgeType: CABLE_LINE_EDGE_TYPE,
        cableBrand: template?.cableBrand ?? DEFAULT_CABLE_BRAND,
    });
}

/**
 * Предложение установить мастер-выключатель во вводной цепи.
 * @param graph — текущий граф проекта.
 * @returns локальное предложение с обновлёнными слотами щита и связями ввода.
 */
function proposeMasterSwitch(graph: ProjectGraph): CopilotChatResponse {
    const maxCurrent = graph.nodes.reduce(
        (current, node) => Math.max(current, node.specs.ratedCurrent),
        0,
    );
    const ratedCurrent = maxCurrent > 0 ? maxCurrent : DEFAULT_RATED_CURRENT;
    const source = graph.nodes.find((node) => node.kind === 'input_source');
    const crossSection = source?.specs.crossSection ?? DEFAULT_CROSS_SECTION;
    const master = createBreakerNode('QF0 Мастер-выключатель', 1, ratedCurrent, crossSection);
    const shiftedNodes = graph.nodes.map((node) =>
        node.panelSlot === null
            ? node
            : GraphNodeSchema.parse({ ...node, panelSlot: node.panelSlot + 1 }),
    );

    const newEdges: GraphEdge[] = [];
    const removedEdgeIds = new Set<string>();
    if (source !== undefined) {
        newEdges.push(cloneEdge(graph, undefined, source.id, master.id));
        graph.edges
            .filter((edge) => edge.from === source.id)
            .forEach((edge) => {
                newEdges.push(cloneEdge(graph, edge, master.id, edge.to));
                removedEdgeIds.add(edge.id);
            });
    }

    const proposedGraph = ProjectGraphSchema.parse({
        ...graph,
        nodes: [...shiftedNodes, master],
        edges: [
            ...graph.edges.filter((edge) => !removedEdgeIds.has(edge.id)),
            ...newEdges,
        ],
    });

    const diffSummary = [
        'Добавлен мастер-выключатель «QF0 Мастер-выключатель» на слот 1 щита.',
    ];
    if (shiftedNodes.some((node) => node.panelSlot !== null)) {
        diffSummary.push('Существующие модули щита сдвинуты на один слот.');
    }
    diffSummary.push(
        `Номинал мастер-выключателя скопирован из максимального тока существующих узлов (${ratedCurrent} А).`,
    );
    if (source !== undefined) {
        diffSummary.push('Ввод подключён к мастер-выключателю, прежние линии переключены через него.');
    } else {
        diffSummary.push('Вводный источник не найден: выключатель добавлен без подключения к вводу.');
    }

    return makeResponse(
        'Предлагается установить мастер-выключатель QF0 во вводной цепи проекта.',
        diffSummary,
        proposedGraph,
    );
}

/**
 * Предложение выделить духовой шкаф на отдельную линию со своим автоматом.
 * @param graph — текущий граф проекта.
 * @returns локальное предложение или сообщение об отсутствии духового шкафа.
 */
function proposeOvenLine(graph: ProjectGraph): CopilotChatResponse {
    const oven = graph.nodes.find((node) =>
        node.kind === 'appliance'
        && (node.label.toLowerCase().includes('духов') || node.label.toLowerCase().includes('oven')),
    );
    if (oven === undefined) {
        return makeResponse(
            'Не нашёл духовой шкаф в графе проекта. Добавьте прибор с подписью «духовой шкаф» или «oven» и повторите команду.',
            [],
        );
    }

    const usedSlots = new Set(
        graph.nodes
            .map((node) => node.panelSlot)
            .filter((slot): slot is number => slot !== null),
    );
    let freeSlot = 1;
    while (usedSlots.has(freeSlot)) {
        freeSlot += 1;
    }

    const breaker = createBreakerNode(
        `QF${freeSlot} Духовой шкаф`,
        freeSlot,
        oven.specs.ratedCurrent,
        oven.specs.crossSection,
    );
    const incoming = graph.edges.filter((edge) => edge.to === oven.id);
    const newEdges: GraphEdge[] = [];
    const removedEdgeIds = new Set<string>();
    if (incoming.length > 0) {
        incoming.forEach((edge) => {
            newEdges.push(cloneEdge(graph, edge, edge.from, breaker.id));
            newEdges.push(cloneEdge(graph, edge, breaker.id, oven.id));
            removedEdgeIds.add(edge.id);
        });
    } else {
        const source = graph.nodes.find(
            (node) => node.kind === 'panel' || node.kind === 'input_source',
        );
        if (source !== undefined) {
            newEdges.push(cloneEdge(graph, undefined, source.id, breaker.id));
        }
        newEdges.push(cloneEdge(graph, undefined, breaker.id, oven.id));
    }

    const proposedGraph = ProjectGraphSchema.parse({
        ...graph,
        nodes: [...graph.nodes, breaker],
        edges: [
            ...graph.edges.filter((edge) => !removedEdgeIds.has(edge.id)),
            ...newEdges,
        ],
    });

    const diffSummary = [
        `Добавлен отдельный автоматический выключатель «${breaker.label}» на свободный слот ${freeSlot} щита.`,
        'Прямое питание духового шкафа заменено на линию через новый автомат.',
        `Номинал автомата скопирован из параметров прибора (${oven.specs.ratedCurrent} А); сечения жил не пересчитывались.`,
    ];
    return makeResponse(
        'Для духового шкафа предложена отдельная линия с собственным автоматическим выключателем.',
        diffSummary,
        proposedGraph,
    );
}

/**
 * Декларативное предложение переопределить бренд устройств на КЭАЗ.
 * @param graph — текущий граф проекта.
 * @returns локальное предложение без обращения к каталогу.
 */
function proposeKeaz(graph: ProjectGraph): CopilotChatResponse {
    const affected = graph.nodes.filter(
        (node) => node.panelSlot !== null || node.kind === 'panel',
    );
    if (affected.length === 0) {
        return makeResponse(
            'В проекте нет устройств щита, которые можно переопределить на КЭАЗ.',
            [],
        );
    }

    const nodes = graph.nodes.map((node) => {
        if (node.panelSlot === null && node.kind !== 'panel') {
            return node;
        }
        const needsLabel = node.kind === 'panel'
            && !node.label.toLowerCase().includes('(кэаз)');
        return GraphNodeSchema.parse({
            ...node,
            catalogDeviceId: null,
            label: needsLabel ? `${node.label} (КЭАЗ)` : node.label,
        });
    });

    const diffSummary = affected.map((node) => {
        const changes = ['ссылка на каталог сброшена'];
        if (node.kind === 'panel') {
            changes.push('подпись дополнена пометкой «(КЭАЗ)»');
        }
        return `Узел «${node.label}»: ${changes.join(', ')}.`;
    });

    const proposedGraph = ProjectGraphSchema.parse({ ...graph, nodes });
    return makeResponse(
        'Подготовлено переопределение бренда устройств щита на КЭАЗ без обращения к каталогу.',
        diffSummary,
        proposedGraph,
    );
}

/**
 * Вежливый ответ на нераспознанную команду с подсказками.
 * @returns ответ без предложения изменений.
 */
function unknownCommandResponse(): CopilotChatResponse {
    return makeResponse(
        'Я пока не распознал команду. Попробуйте одну из подсказок:\n'
            + '• «Добавить мастер-выключатель»\n'
            + '• «Выделить духовой шкаф на отдельную линию»\n'
            + '• «Перейти на КЭАЗ»',
        [],
    );
}

/**
 * Детерминированно сформировать локальное предложение копилота по текстовой команде.
 * RULES § 4.7, § 5.1, § 5.4: без случайности, без расчётов физики, без мутации исходного графа.
 * @param graph — текущий валидный граф проекта.
 * @param message — команда пользователя на русском или английском языке.
 * @returns канонический ответ копилота с proposals при распознанном намерении.
 */
export function createLocalProposal(graph: ProjectGraph, message: string): CopilotChatResponse {
    const text = normalize(message);
    if (matchesAny(text, [
        'мастер-выключатель',
        'мастер выключатель',
        'master switch',
        'master-switch',
    ])) {
        return proposeMasterSwitch(graph);
    }
    if (matchesAny(text, ['духов', 'oven', 'отдельную линию', 'отдельная линия'])) {
        return proposeOvenLine(graph);
    }
    if (matchesAny(text, ['кэаз', 'keaz'])) {
        return proposeKeaz(graph);
    }
    return unknownCommandResponse();
}
