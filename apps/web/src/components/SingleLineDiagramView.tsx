// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import type { GraphEdge, GraphNode, NodeKind, ProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import { useMemo, useRef } from 'react';
import { useI18n } from '../i18n/index.js';
import { downloadPdfAsync, downloadPngAsync, downloadSvgAsync } from '../lib/diagramExport.js';
import { useCalculationStore } from '../store/calculationStore.js';
import { useEditorStore } from '../store/editorStore.js';

/** Ширина символа узла, px. */
const NODE_WIDTH = 150;
/** Высота символа узла, px. */
const NODE_HEIGHT = 54;
/** Шаг между уровнями иерархии, px. */
const COLUMN_STEP = 220;
/** Шаг между узлами одного уровня, px. */
const ROW_STEP = 110;
/** Левый отступ сетки, px. */
const MARGIN_X = 40;
/** Верхний отступ сетки, px. */
const MARGIN_Y = 40;
/** Запас по ширине для подписей линий справа от узлов, px. */
const LABEL_EXTRA_WIDTH = 420;

/** Узел с рассчитанными координатами на схеме. */
interface PositionedNode {
    /** Узел канонического графа. */
    node: GraphNode;
    /** Координата левого верхнего угла символа, px. */
    x: number;
    /** Координата левого верхнего угла символа, px. */
    y: number;
}

/** Соединитель между родительским и дочерним узлами. */
interface Connector {
    /** Родительский узел. */
    from: PositionedNode;
    /** Дочерний узел. */
    to: PositionedNode;
}

/** Результат автоматической раскладки однолинейной схемы. */
interface DiagramLayout {
    /** Все узлы в порядке уровня и строки. */
    items: PositionedNode[];
    /** Быстрый доступ к узлу по идентификатору. */
    byId: Map<string, PositionedNode>;
    /** Соединители, выведенные из рёбер графа. */
    connectors: Connector[];
    /** Ширина холста SVG, px. */
    width: number;
    /** Высота холста SVG, px. */
    height: number;
}

/**
 * Определить базовый уровень узла по его типу УГО.
 * @param kind Тип узла графа.
 * @returns 0 — ввод/щит, 1 — коммутационные и защитные аппараты, 2 — потребители.
 */
function baseDepth(kind: NodeKind): number {
    if (kind === 'input_source' || kind === 'panel') {
        return 0;
    }
    if (
        kind === 'circuit_breaker' ||
        kind === 'relay_voltage' ||
        kind === 'rcd' ||
        kind === 'rcbo' ||
        kind === 'contactor'
    ) {
        return 1;
    }
    return 2;
}

/**
 * Выбрать корневой узел, к которому привязать узел без входящего ребра.
 * @param node Узел без входящей линии.
 * @param roots Корневые узлы (ввод или щит).
 * @param fallback Узел, используемый когда корней нет.
 * @returns Выбранный родительский узел.
 */
function chooseRoot(node: GraphNode, roots: readonly GraphNode[], fallback: GraphNode): GraphNode {
    if (node.kind === 'panel') {
        const source = roots.find((root) => root.kind === 'input_source' && root.id !== node.id);
        if (source !== undefined) {
            return source;
        }
    }
    return roots.find((root) => root.id !== node.id) ?? fallback;
}

/**
 * Построить детерминированную раскладку дерева схемы из канонического графа.
 * Положение на плане (planPosition) намеренно не используется: схема
 * отражает электрическую иерархию, заданную рёбрами и типами УГО.
 * @param graph Канонический граф проекта (RULES § 5.2).
 * @returns Раскладка с координатами, соединителями и размером холста.
 */
function buildLayout(graph: ProjectGraph): DiagramLayout {
    const nodes = graph.nodes;
    if (nodes.length === 0) {
        return { items: [], byId: new Map(), connectors: [], width: 0, height: 0 };
    }

    const byNodeId = new Map<string, GraphNode>(nodes.map((node) => [node.id, node]));
    const roots = nodes.filter(
        (node) => node.kind === 'input_source' || node.kind === 'panel',
    );
    const fallbackRoot = roots[0] ?? nodes[0];

    const parentById = new Map<string, string>();
    for (const edge of graph.edges) {
        if (byNodeId.has(edge.from) && byNodeId.has(edge.to) && !parentById.has(edge.to)) {
            parentById.set(edge.to, edge.from);
        }
    }
    for (const node of nodes) {
        if (node.id !== fallbackRoot.id && !parentById.has(node.id)) {
            parentById.set(node.id, chooseRoot(node, roots, fallbackRoot).id);
        }
    }

    const depthById = new Map<string, number>();
    const finalized = new Set<string>();
    const computeDepth = (id: string, visiting: ReadonlySet<string>): number => {
        const cached = depthById.get(id);
        if (cached !== undefined && finalized.has(id)) {
            return cached;
        }
        const node = byNodeId.get(id);
        if (node === undefined) {
            return 0;
        }
        let depth = baseDepth(node.kind);
        const parentId = parentById.get(id);
        if (
            parentId !== undefined &&
            parentId !== id &&
            byNodeId.has(parentId) &&
            !visiting.has(parentId)
        ) {
            const nextVisiting = new Set(visiting);
            nextVisiting.add(id);
            depth = Math.max(depth, computeDepth(parentId, nextVisiting) + 1);
        }
        depthById.set(id, depth);
        finalized.add(id);
        return depth;
    };
    for (const node of nodes) {
        computeDepth(node.id, new Set<string>());
    }

    const groups = new Map<number, GraphNode[]>();
    for (const node of nodes) {
        const depth = depthById.get(node.id) ?? baseDepth(node.kind);
        const group = groups.get(depth) ?? [];
        group.push(node);
        groups.set(depth, group);
    }

    const items: PositionedNode[] = [];
    const byId = new Map<string, PositionedNode>();
    for (const [depth, group] of groups) {
        group.forEach((node, index) => {
            const positioned: PositionedNode = {
                node,
                x: depth * COLUMN_STEP + MARGIN_X,
                y: index * ROW_STEP + MARGIN_Y,
            };
            items.push(positioned);
            byId.set(node.id, positioned);
        });
    }
    items.sort((left, right) => left.x - right.x || left.y - right.y);

    const connectors: Connector[] = [];
    for (const to of items) {
        const parentId = parentById.get(to.node.id);
        if (parentId === undefined || parentId === to.node.id) {
            continue;
        }
        const from = byId.get(parentId);
        if (from !== undefined) {
            connectors.push({ from, to });
        }
    }

    let maxDepth = 0;
    let maxPerLevel = 0;
    for (const [depth, group] of groups) {
        maxDepth = Math.max(maxDepth, depth);
        maxPerLevel = Math.max(maxPerLevel, group.length);
    }

    return {
        items,
        byId,
        connectors,
        width: Math.max(600, maxDepth * COLUMN_STEP + LABEL_EXTRA_WIDTH),
        height: Math.max(320, maxPerLevel * ROW_STEP + 120),
    };
}

/**
 * Подпись типа УГО внутри символа узла.
 * @param node Узел графа.
 * @returns Короткая подпись с номиналом.
 */
function subtitleForNode(node: GraphNode): string {
    const current = node.specs.ratedCurrent;
    switch (node.kind) {
        case 'circuit_breaker':
            return `C${current}`;
        case 'rcd':
            return `УЗО ${current}А`;
        case 'rcbo':
            return `АВДТ ${current}А`;
        case 'relay_voltage':
            return `РН ${current}А`;
        case 'contactor':
            return `К ${current}А`;
        case 'input_source':
            return `Ввод ${current}А`;
        case 'panel':
            return `Щит ${current}А`;
        default:
            return `${current}А`;
    }
}

/**
 * цвет заливки символа по типу УГО.
 * @param kind Тип узла графа.
 * @returns CSS-цвет заливки.
 */
function fillForKind(kind: NodeKind): string {
    if (kind === 'input_source') {
        return '#dbeafe';
    }
    if (kind === 'panel') {
        return '#bfdbfe';
    }
    if (
        kind === 'circuit_breaker' ||
        kind === 'rcd' ||
        kind === 'rcbo' ||
        kind === 'relay_voltage' ||
        kind === 'contactor'
    ) {
        return '#fef3c7';
    }
    return '#f1f5f9';
}

/**
 * Обрезать длинную подпись до заданной длины.
 * @param text Исходный текст.
 * @param maxLength Максимальное число символов.
 * @returns Подпись, помещающаяся в символ узла.
 */
function truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * Однолинейная схема проекта, автоматически строящаяся по каноническому графу.
 * Узлы и подписи линий кликабельны и синхронизируют выделение с редактором.
 * @returns React-элемент вида со SVG-схемой и кнопками экспорта.
 */
export function SingleLineDiagramView(): React.JSX.Element {
    const { t } = useI18n();
    const graph = useEditorStore((state) => state.graph);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const selectedEdgeId = useEditorStore((state) => state.selectedEdgeId);
    const selectNode = useEditorStore((state) => state.selectNode);
    const selectEdge = useEditorStore((state) => state.selectEdge);
    const shortCircuit = useCalculationStore((state) => state.shortCircuit);
    const svgRef = useRef<SVGSVGElement | null>(null);

    const layout = useMemo(() => buildLayout(graph), [graph]);
    const isEmpty = graph.nodes.length === 0;
    const rawName = graph.name.replace(/[^\p{L}\p{N}._-]+/gu, '_');
    const fileName = rawName.length > 0 ? rawName : 'single-line';

    const handleExportSvg = (): void => {
        const svg = svgRef.current;
        if (svg !== null) {
            void downloadSvgAsync(svg, fileName);
        }
    };
    const handleExportPng = (): void => {
        const svg = svgRef.current;
        if (svg !== null) {
            void downloadPngAsync(svg, fileName);
        }
    };
    const handleExportPdf = (): void => {
        const svg = svgRef.current;
        if (svg !== null) {
            void downloadPdfAsync(svg, fileName);
        }
    };

    return (
        <section className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-700 px-4 py-3">
                <h2 className="mr-auto text-sm font-semibold uppercase tracking-wide text-slate-300">
                    {t('sld.title')}
                </h2>
                <button
                    type="button"
                    disabled={isEmpty}
                    onClick={handleExportSvg}
                    className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                >
                    {t('sld.exportSvg')}
                </button>
                <button
                    type="button"
                    disabled={isEmpty}
                    onClick={handleExportPng}
                    className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                >
                    {t('sld.exportPng')}
                </button>
                <button
                    type="button"
                    disabled={isEmpty}
                    onClick={handleExportPdf}
                    className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                >
                    {t('sld.exportPdf')}
                </button>
            </div>

            {isEmpty ? (
                <p className="p-6 text-sm text-slate-400">{t('sld.empty')}</p>
            ) : (
                <div className="min-h-0 flex-1 overflow-auto p-4">
                    <svg
                        ref={svgRef}
                        xmlns="http://www.w3.org/2000/svg"
                        width={layout.width}
                        height={layout.height}
                        viewBox={`0 0 ${layout.width} ${layout.height}`}
                        className="block"
                    >
                        <rect x={0} y={0} width={layout.width} height={layout.height} fill="#ffffff" />

                        {layout.connectors.map(({ from, to }) => {
                            const parentCenterX = from.x + NODE_WIDTH / 2;
                            const parentBottom = from.y + NODE_HEIGHT;
                            const childCenterX = to.x + NODE_WIDTH / 2;
                            const middleY = (parentBottom + to.y) / 2;
                            return (
                                <polyline
                                    key={`${from.node.id}-${to.node.id}`}
                                    points={`${parentCenterX},${parentBottom} ${parentCenterX},${middleY} ${childCenterX},${middleY} ${childCenterX},${to.y}`}
                                    fill="none"
                                    stroke="#64748b"
                                    strokeWidth={1.5}
                                />
                            );
                        })}

                        {layout.items.map(({ node, x, y }) => {
                            const selected = node.id === selectedNodeId;
                            return (
                                <g
                                    key={node.id}
                                    onClick={() => selectNode(node.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <rect
                                        x={x}
                                        y={y}
                                        width={NODE_WIDTH}
                                        height={NODE_HEIGHT}
                                        rx={4}
                                        fill={fillForKind(node.kind)}
                                        stroke={selected ? '#38bdf8' : '#475569'}
                                        strokeWidth={selected ? 3 : 1.5}
                                    />
                                    <text
                                        x={x + NODE_WIDTH / 2}
                                        y={y + 22}
                                        textAnchor="middle"
                                        fontSize={12}
                                        fontWeight={600}
                                        fill="#0f172a"
                                    >
                                        {truncate(node.label, 22)}
                                    </text>
                                    <text
                                        x={x + NODE_WIDTH / 2}
                                        y={y + 40}
                                        textAnchor="middle"
                                        fontSize={11}
                                        fill="#334155"
                                    >
                                        {subtitleForNode(node)}
                                    </text>
                                </g>
                            );
                        })}

                        {graph.edges.map((edge: GraphEdge) => {
                            const target = layout.byId.get(edge.to);
                            if (target === undefined) {
                                return null;
                            }
                            const selected = edge.id === selectedEdgeId;
                            const labelX = target.x + NODE_WIDTH + 10;
                            const labelY = target.y + 8;
                            const scLine = shortCircuit?.lines.find((item) => item.edgeId === edge.id);
                            const firstLine = `${edge.cableBrand ?? '—'} · ${edge.cableSpecs.crossSection}мм²`;
                            const secondLine = `${edge.cableSpecs.length.toFixed(1)}м · ${(target.node.specs.ratedPower / 1000).toFixed(2)}кВт · ${target.node.specs.ratedCurrent}А`;
                            const thirdLine = scLine === undefined
                                ? 'Iкз: —'
                                : `Iкз ${scLine.shortCircuitCurrentA.toFixed(0)}A · ΔU ${scLine.voltageDropPercent.toFixed(1)}% · ${scLine.selectivityOk ? 'OK' : 'ERR'}`;
                            return (
                                <g
                                    key={edge.id}
                                    onClick={() => selectEdge(edge.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <rect
                                        x={labelX}
                                        y={labelY}
                                        width={180}
                                        height={48}
                                        rx={3}
                                        fill="#f8fafc"
                                        stroke={selected ? '#38bdf8' : '#cbd5e1'}
                                        strokeWidth={selected ? 2 : 1}
                                    />
                                    <text x={labelX + 6} y={labelY + 14} fontSize={10} fill="#0f172a">
                                        {truncate(firstLine, 28)}
                                    </text>
                                    <text x={labelX + 6} y={labelY + 27} fontSize={10} fill="#334155">
                                        {truncate(secondLine, 30)}
                                    </text>
                                    <text
                                        x={labelX + 6}
                                        y={labelY + 41}
                                        fontSize={10}
                                        fill={scLine === undefined ? '#64748b' : scLine.selectivityOk ? '#15803d' : '#b91c1c'}
                                    >
                                        {truncate(thirdLine, 30)}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            )}
        </section>
    );
}
