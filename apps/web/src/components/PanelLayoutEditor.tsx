// © 2026 RuChating (iilmchat) · VoltWireCraft v0.6.0
import type { GraphNode } from '@voltwirecraft/shared/graph.schema.js';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import {
    getFeederEdges,
    getNodesForPanel,
    resolveActivePanelId,
} from '../lib/panelHierarchy.js';
import {
    DIN_MODULE_WIDTH_MM,
    RAIL_MODULES,
    moduleWidthModules,
    phaseColor,
    phaseForSlot,
    ratingLabel,
} from '../lib/panelModules.js';
import { useEditorStore } from '../store/editorStore.js';
import { useUiStore } from '../store/uiStore.js';

/** Высота прямоугольника модуля в координатах SVG, px. */
const MODULE_HEIGHT = 72;

/** Шаг между рядами DIN-рейки по вертикали, px. */
const RAIL_ROW_STEP = 120;

/** Отступ первого ряда от верхней границы корпуса, px. */
const RAIL_TOP_OFFSET = 40;

/** Левый отступ модулей от границы корпуса, px. */
const MODULES_LEFT = 20;

/** Отступ корпуса от границы холста SVG, px. */
const ENCLOSURE_INSET = 10;

/** Фазы, используемые в легенде. */
const LEGEND_PHASES = ['L1', 'L2', 'L3'] as const;

/** Узел графа с гарантированно назначенным слотом щита. */
type SlottedNode = GraphNode & { panelSlot: number };

/** Модуль щита, размещённый на конкретном ряду DIN-рейки. */
interface PlacedModule {
    /** Узел канонического графа со слотом щита. */
    node: SlottedNode;
    /** Координата X левого края, px. */
    x: number;
    /** Координата Y верхнего края, px. */
    y: number;
    /** Ширина прямоугольника, px. */
    width: number;
    /** Номер ряда рейки (с нуля). */
    railIndex: number;
}

/**
 * Разложить модули по рядам в порядке возрастания `panelSlot` из графа.
 * Модуль, который не помещается в текущий ряд целиком, переносится в следующий.
 *
 * @param nodes Узлы графа с назначенным слотом щита.
 * @returns Массив размещённых модулей и число задействованных рядов.
 */
function layoutModules(nodes: readonly SlottedNode[]): { modules: PlacedModule[]; railCount: number } {
    const modules: PlacedModule[] = [];
    let railIndex = 0;
    let slotWithinRail = 0;

    for (const node of nodes) {
        const widthModules = moduleWidthModules(node);
        if (slotWithinRail + widthModules > RAIL_MODULES) {
            railIndex += 1;
            slotWithinRail = 0;
        }
        modules.push({
            node,
            x: MODULES_LEFT + slotWithinRail * DIN_MODULE_WIDTH_MM,
            y: railIndex * RAIL_ROW_STEP + RAIL_TOP_OFFSET,
            width: widthModules * DIN_MODULE_WIDTH_MM,
            railIndex,
        });
        slotWithinRail += widthModules;
    }

    return { modules, railCount: modules.length === 0 ? 0 : railIndex + 1 };
}

/**
 * SVG-визуализация собранного щита НКУ, построенная из канонического ProjectGraph
 * (RULES § 5.2): узлы со слотом щита раскладываются по DIN-рейкам, фаза и номинал
 * вычисляются из спецификации узла, а выделение синхронизировано с хранилищем редактора.
 *
 * @returns React-элемент прокручиваемой панели компоновки щита.
 */
export function PanelLayoutEditor() {
    const { t } = useI18n();
    const graph = useEditorStore((state) => state.graph);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const selectNode = useEditorStore((state) => state.selectNode);
    const activePanelId = useUiStore((state) => state.activePanelId);

    // Graph-First: фильтруем тот же граф по активному щиту сессии (RULES § 5.2).
    const resolvedPanelId = resolveActivePanelId(graph, activePanelId);
    const scopedNodes = resolvedPanelId === null
        ? graph.nodes
        : getNodesForPanel(graph, resolvedPanelId);
    const activePanel = graph.nodes.find((node) => node.id === resolvedPanelId);
    const feeders = getFeederEdges(graph);
    const incoming = resolvedPanelId === null
        ? []
        : feeders.filter((edge) => edge.to === resolvedPanelId);
    const outgoing = resolvedPanelId === null
        ? []
        : feeders.filter((edge) => edge.from === resolvedPanelId);

    // Только узлы со слотом щита, в порядке возрастания канонического panelSlot.
    const panelNodes = scopedNodes
        .filter((node): node is SlottedNode => node.panelSlot !== null)
        .sort((a, b) => a.panelSlot - b.panelSlot);

    const { modules, railCount } = layoutModules(panelNodes);

    const svgWidth = 2 * MODULES_LEFT + RAIL_MODULES * DIN_MODULE_WIDTH_MM;
    const svgHeight = railCount * RAIL_ROW_STEP + 50;
    const railLeft = MODULES_LEFT;
    const railRight = svgWidth - MODULES_LEFT;

    return (
        <section className="flex h-full w-full flex-col overflow-auto bg-slate-950 p-4">
            <h2 className="mb-1 shrink-0 text-sm font-semibold uppercase tracking-wide text-slate-300">
                {t('panel.title' as TranslationKey)}
            </h2>
            <p className="mb-1 shrink-0 text-xs text-slate-500">
                {t('panel.hint' as TranslationKey)}
            </p>
            {activePanel !== undefined && (
                <p className="mb-4 shrink-0 text-xs text-sky-300/80" role="status">
                    {t('panel.activePanel' as TranslationKey)}: {activePanel.label} ·{' '}
                    {t('panel.feeders' as TranslationKey)}: {incoming.length} / {outgoing.length}
                </p>
            )}

            {modules.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
                    {t('panel.empty' as TranslationKey)}
                </div>
            ) : (
                <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    width={svgWidth}
                    height={svgHeight}
                    className="shrink-0 self-start rounded bg-slate-900"
                    role="img"
                    aria-label={t('panel.title' as TranslationKey)}
                >
                    {/* Корпус щита */}
                    <rect
                        x={ENCLOSURE_INSET}
                        y={ENCLOSURE_INSET}
                        width={svgWidth - 2 * ENCLOSURE_INSET}
                        height={svgHeight - 2 * ENCLOSURE_INSET}
                        rx={4}
                        fill="#0f172a"
                        stroke="#475569"
                        strokeWidth={2}
                    />

                    {/* DIN-рейки: две линии и метки модульных позиций на каждый ряд */}
                    {Array.from({ length: railCount }, (_, railIndex) => {
                        const railTop = railIndex * RAIL_ROW_STEP + RAIL_TOP_OFFSET - 5;
                        const railBottom = railIndex * RAIL_ROW_STEP + RAIL_TOP_OFFSET + MODULE_HEIGHT + 5;
                        return (
                            <g key={`rail-${railIndex}`}>
                                <line x1={railLeft} y1={railTop} x2={railRight} y2={railTop}
                                    stroke="#64748b" strokeWidth={2} />
                                <line x1={railLeft} y1={railBottom} x2={railRight} y2={railBottom}
                                    stroke="#64748b" strokeWidth={2} />
                                {Array.from({ length: RAIL_MODULES + 1 }, (_, tick) => (
                                    <line
                                        key={tick}
                                        x1={MODULES_LEFT + tick * DIN_MODULE_WIDTH_MM}
                                        y1={railTop}
                                        x2={MODULES_LEFT + tick * DIN_MODULE_WIDTH_MM}
                                        y2={railTop + 6}
                                        stroke="#475569"
                                        strokeWidth={1}
                                    />
                                ))}
                                <text x={railLeft} y={railTop - 8} fontSize={10} fill="#94a3b8">
                                    {`${t('panel.rail' as TranslationKey)} ${railIndex + 1} · ${RAIL_MODULES * DIN_MODULE_WIDTH_MM}${t('common.mm' as TranslationKey)}`}
                                </text>
                            </g>
                        );
                    })}

                    {/* Модули в порядке panelSlot */}
                    {modules.map(({ node, x, y, width }) => {
                        const phase = phaseForSlot(node.panelSlot);
                        const phaseFill = phaseColor(phase);
                        const selected = selectedNodeId === node.id;
                        const stroke = selected ? '#38bdf8' : '#94a3b8';
                        return (
                            <g
                                key={node.id}
                                className="cursor-pointer"
                                onClick={() => selectNode(node.id)}
                            >
                                <title>{`${node.label} · ${ratingLabel(node)}`}</title>
                                <rect
                                    x={x}
                                    y={y}
                                    width={width}
                                    height={MODULE_HEIGHT}
                                    fill={phaseFill}
                                    fillOpacity={0.2}
                                    stroke={stroke}
                                    strokeWidth={selected ? 3 : 1}
                                    rx={2}
                                />
                                <text x={x + 3} y={y + 14} fontSize={10} fontWeight="bold" fill="#f8fafc">
                                    {node.label}
                                </text>
                                <text x={x + 3} y={y + 28} fontSize={9} fill="#e2e8f0">
                                    {ratingLabel(node)}
                                </text>
                                <text x={x + 3} y={y + 41} fontSize={9} fill="#cbd5e1">
                                    {`${moduleWidthModules(node)}М`}
                                </text>
                                <text x={x + 3} y={y + 54} fontSize={9} fill={phaseFill}>
                                    {t(`phase.${phase}` as TranslationKey)}
                                </text>
                                <text x={x + 3} y={y + 67} fontSize={8} fill="#94a3b8">
                                    {`${t('panel.slot' as TranslationKey)} ${node.panelSlot}`}
                                </text>
                            </g>
                        );
                    })}

                    {/* Легенда фаз */}
                    <g>
                        {LEGEND_PHASES.map((phase, index) => {
                            const x = MODULES_LEFT + index * 100;
                            const y = railCount * RAIL_ROW_STEP + 24;
                            return (
                                <g key={phase}>
                                    <rect
                                        x={x}
                                        y={y}
                                        width={12}
                                        height={12}
                                        fill={phaseColor(phase)}
                                        fillOpacity={0.6}
                                        stroke={phaseColor(phase)}
                                        strokeWidth={1}
                                        rx={2}
                                    />
                                    <text x={x + 18} y={y + 10} fontSize={10} fill="#e2e8f0">
                                        {t(`phase.${phase}` as TranslationKey)}
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                </svg>
            )}
        </section>
    );
}
