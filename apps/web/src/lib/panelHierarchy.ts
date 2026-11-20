// © 2026 RuChating (iilmchat) · VoltWireCraft v0.6.0
/**
 * Иерархия щитов `ВРУ → ЩР → ЩО` как представление канонического графа
 * (RULES § 5.2): helper-функции НЕ копируют граф, а фильтруют его для проекций.
 */
import type { GraphEdge, GraphNode, ProjectGraph } from '@voltwirecraft/shared/graph.schema.js';

/** Роль щита в иерархии. */
export type PanelRole = 'main_vru' | 'sub_shr' | 'lighting_sho';

/** Узел-щит с 역할ом и родителем. */
export interface PanelInfo {
    /** Канонический узел `kind === 'panel'`. */
    node: GraphNode;
    /** Роль щита; для старых проектов — `main_vru`. */
    role: PanelRole;
    /** Родительский щит; `null` для корневого ВРУ. */
    parentPanelId: string | null;
    /** Дочерние щиты в порядке следования. */
    children: readonly string[];
}

/**
 * Все узлы-щиты графа в порядке: корень, затем дочерние по `panelSlot`.
 * @param graph Канонический граф проекта.
 * @returns Массив описаний щитов.
 */
export function getPanels(graph: ProjectGraph): readonly PanelInfo[] {
    const panels = graph.nodes
        .filter((node) => node.kind === 'panel')
        .sort((a, b) => {
            const roleOrder = (role: PanelRole): number =>
                role === 'main_vru' ? 0 : role === 'sub_shr' ? 1 : 2;
            const left = roleOrder((a.panelRole ?? 'main_vru') as PanelRole);
            const right = roleOrder((b.panelRole ?? 'main_vru') as PanelRole);
            return left - right || (a.panelSlot ?? 0) - (b.panelSlot ?? 0);
        });
    const ids = new Set(panels.map((panel) => panel.id));
    const infos = panels.map((node): PanelInfo => {
        const parent = node.parentPanelId !== undefined && ids.has(node.parentPanelId)
            ? node.parentPanelId
            : null;
        return {
            node,
            role: (node.panelRole ?? 'main_vru') as PanelRole,
            parentPanelId: parent,
            children: [],
        };
    });
    for (const info of infos) {
        if (info.parentPanelId !== null) {
            const parent = infos.find((item) => item.node.id === info.parentPanelId);
            if (parent !== undefined) {
                (parent.children as string[]).push(info.node.id);
            }
        }
    }
    return infos;
}

/**
 * Выбрать корректный активный щит: запрошенный, либо корневой, либо первый.
 * @param graph Канонический граф.
 * @param requested Идентификатор из UI-сессии.
 * @returns Идентификатор активного щита или `null`, если щитов нет.
 */
export function resolveActivePanelId(graph: ProjectGraph, requested: string | null): string | null {
    const panels = getPanels(graph);
    if (panels.length === 0) {
        return null;
    }
    if (requested !== null && panels.some((panel) => panel.node.id === requested)) {
        return requested;
    }
    return (panels.find((panel) => panel.parentPanelId === null) ?? panels[0]).node.id;
}

/**
 * Магистральные линии между щитами (feeder_line или ребро «щит → щит»).
 * @param graph Канонический граф.
 * @returns Массив рёбер-магистралей.
 */
export function getFeederEdges(graph: ProjectGraph): readonly GraphEdge[] {
    const panelIds = new Set(graph.nodes.filter((node) => node.kind === 'panel').map((node) => node.id));
    return graph.edges.filter(
        (edge) => edge.edgeType === 'feeder_line' || (panelIds.has(edge.from) && panelIds.has(edge.to)),
    );
}

/**
 * узлы, электрически принадлежащие щиту: сам щит и все потребители/аппараты,
 * достижимые по рёбрам, пока не встретится другой щит.
 * @param graph Канонический граф.
 * @param panelId Идентификатор активного щита.
 * @returns Отфильтрованная выборка узлов (без копирования графа).
 */
export function getNodesForPanel(graph: ProjectGraph, panelId: string): readonly GraphNode[] {
    const panelNode = graph.nodes.find((node) => node.id === panelId && node.kind === 'panel');
    if (panelNode === undefined) {
        return [];
    }
    const adjacent = new Map<string, string[]>();
    for (const edge of graph.edges) {
        const forward = adjacent.get(edge.from) ?? [];
        forward.push(edge.to);
        adjacent.set(edge.from, forward);
        const backward = adjacent.get(edge.to) ?? [];
        backward.push(edge.from);
        adjacent.set(edge.to, backward);
    }
    const included = new Set<string>([panelId]);
    const queue = [panelId];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) {
            continue;
        }
        for (const next of adjacent.get(current) ?? []) {
            if (included.has(next)) {
                continue;
            }
            const node = graph.nodes.find((item) => item.id === next);
            if (node === undefined || node.kind === 'panel') {
                continue;
            }
            included.add(next);
            queue.push(next);
        }
    }
    return graph.nodes.filter((node) => included.has(node.id));
}

/**
 * Рёбра, соединяющие узлы выбранного щита (включая входящую магистраль).
 * @param graph Канонический граф.
 * @param panelId Идентификатор активного щита.
 * @returns Отфильтрованные рёбра для схемы щита.
 */
export function getEdgesForPanel(graph: ProjectGraph, panelId: string): readonly GraphEdge[] {
    const nodeIds = new Set(getNodesForPanel(graph, panelId).map((node) => node.id));
    const incoming = getFeederEdges(graph).filter((edge) => edge.to === panelId);
    const incomingIds = new Set(incoming.map((edge) => edge.id));
    return graph.edges.filter(
        (edge) => incomingIds.has(edge.id) || (nodeIds.has(edge.from) && nodeIds.has(edge.to)),
    );
}
