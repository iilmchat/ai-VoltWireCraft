// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { createEmptyProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import type { GraphNode } from '@voltwirecraft/shared/graph.schema.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildBomRows } from './bomExport.js';
import {
    MODULES_PER_KIND,
    moduleWidthModules,
    phaseColor,
    phaseForSlot,
    ratingLabel,
} from './panelModules.js';
import { useEditorStore } from '../store/editorStore.js';
import { useUiStore } from '../store/uiStore.js';

/**
 * Создать узел щита для тестов.
 * @param id Идентификатор узла.
 * @param kind Вид УГО.
 * @param slot Номер слота.
 * @param current Номинальный ток.
 * @returns Валидный узел графа.
 */
function makeNode(
    id: string,
    kind: GraphNode['kind'],
    slot: number,
    current: number,
): GraphNode {
    return {
        id,
        kind,
        label: `QF ${slot}`,
        planPosition: null,
        panelSlot: slot,
        specs: {
            ratedPower: 0,
            ratedCurrent: current,
            crossSection: 2.5,
            mountingHeight: 1.5,
        },
    };
}

describe('panelModules', () => {
    it('определяет фазу по номеру слота', () => {
        expect(phaseForSlot(1)).toBe('L1');
        expect(phaseForSlot(2)).toBe('L2');
        expect(phaseForSlot(3)).toBe('L3');
        expect(phaseColor('L1')).toBe('#facc15');
    });

    it('формирует подпись номинала по виду УГО', () => {
        expect(ratingLabel(makeNode('a', 'circuit_breaker', 1, 16))).toBe('C16');
        expect(ratingLabel(makeNode('b', 'rcd', 2, 25))).toContain('30');
    });

    it('возвращает ширину модуля для всех видов УГО', () => {
        expect(MODULES_PER_KIND.circuit_breaker).toBe(1);
        expect(moduleWidthModules(makeNode('c', 'rcbo', 3, 25))).toBe(4);
    });
});

describe('buildBomRows', () => {
    it('группирует кабели и считает длину', () => {
        const graph = createEmptyProjectGraph();
        const withData = {
            ...graph,
            nodes: [
                makeNode('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'panel', 1, 63),
                makeNode('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'socket', 2, 16),
            ],
            edges: [
                {
                    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                    from: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    to: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu' as const, length: 12 },
                    cableBrand: 'ВВГнг(А)-LS',
                },
                {
                    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                    from: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    to: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu' as const, length: 8 },
                    cableBrand: 'ВВГнг(А)-LS',
                },
            ],
        };
        const { cables, devices } = buildBomRows(withData);
        expect(cables).toHaveLength(1);
        expect(cables[0]?.quantity).toBe(2);
        expect(cables[0]?.lengthM).toBe(20);
        expect(devices.length).toBeGreaterThan(0);
    });
});

describe('uiStore.focusIssue', () => {
    beforeEach(() => {
        useEditorStore.getState().setGraph(createEmptyProjectGraph());
        useUiStore.getState().setActiveView('plan');
    });

    it('переключает вид и выделяет узел из замечания', () => {
        useEditorStore.getState().addNode('panel', { x: 0, y: 0 });
        const nodeId = useEditorStore.getState().selectedNodeId;
        expect(nodeId).not.toBeNull();
        if (nodeId === null) {
            return;
        }
        useUiStore.getState().focusIssue({
            id: 'issue-1',
            severity: 'warning',
            message: 'Проверить автомат',
            nodeId,
            edgeId: null,
            citation: 'ПУЭ-7 7.1.3',
        });
        expect(useUiStore.getState().activeView).toBe('singleLine');
        expect(useEditorStore.getState().selectedNodeId).toBe(nodeId);
    });
});
