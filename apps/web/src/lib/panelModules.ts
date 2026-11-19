// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import type { GraphNode, NodeKind } from '@voltwirecraft/shared/graph.schema.js';

/** Ширина одного DIN-модуля, мм (RULES § 5.3 — физические величины в СИ). */
export const DIN_MODULE_WIDTH_MM = 18;

/** Ёмкость одного ряда DIN-рейки, модулей. */
export const RAIL_MODULES = 18;

/** Ширина каждого типа УГО в DIN-модулях (18 мм на модуль). */
export const MODULES_PER_KIND: Readonly<Record<NodeKind, number>> = {
    input_source: 2,
    panel: 4,
    circuit_breaker: 1,
    rcd: 2,
    rcbo: 4,
    relay_voltage: 1,
    contactor: 2,
    socket: 1,
    light_fixture: 1,
    switch: 1,
    appliance: 2,
};

/** Цветовая кодировка фаз трёхфазного ввода. */
const PHASE_COLORS: Readonly<Record<'L1' | 'L2' | 'L3', string>> = {
    L1: '#facc15',
    L2: '#22c55e',
    L3: '#ef4444',
};

/**
 * Определить фазу по номеру места в щите (`panelSlot` из канонического графа).
 * Слоты чередуются по остатку от деления на три: 1 → L1, 2 → L2, 0 → L3.
 *
 * @param slot Номер слота щита (натуральное число из ProjectGraph).
 * @returns Обозначение фазы: 'L1', 'L2' или 'L3'.
 */
export function phaseForSlot(slot: number): 'L1' | 'L2' | 'L3' {
    const remainder = ((slot % 3) + 3) % 3;
    if (remainder === 1) {
        return 'L1';
    }
    if (remainder === 2) {
        return 'L2';
    }
    return 'L3';
}

/**
 * Получить цвет линии фазы для SVG-визуализации щита.
 *
 * @param phase Обозначение фазы 'L1', 'L2' или 'L3'.
 * @returns CSS-цвет в формате `#rrggbb`.
 */
export function phaseColor(phase: 'L1' | 'L2' | 'L3'): string {
    return PHASE_COLORS[phase];
}

/**
 * Сформировать подпись номинала модуля для маркировки на рейке.
 * Автоматический выключатель получает префикс `C`, УЗО/АВДТ — уставку 30 мА.
 *
 * @param node Узел канонического графа.
 * @returns Строка номинала, например `C16`, `16А 30мА` или `16А`.
 */
export function ratingLabel(node: GraphNode): string {
    if (node.kind === 'circuit_breaker') {
        return `C${node.specs.ratedCurrent}`;
    }
    if (node.kind === 'rcd' || node.kind === 'rcbo') {
        return `${node.specs.ratedCurrent}А 30мА`;
    }
    return `${node.specs.ratedCurrent}А`;
}

/**
 * Получить занимаемую модулем ширину в DIN-модулях по типу УГО.
 *
 * @param node Узел канонического графа.
 * @returns Число DIN-модулей (целое положительное).
 */
export function moduleWidthModules(node: GraphNode): number {
    return MODULES_PER_KIND[node.kind];
}
