// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { createEmptyProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editorStore.js';

describe('editorStore (канонический граф)', () => {
    beforeEach(() => {
        useEditorStore.getState().setGraph(createEmptyProjectGraph('Тест'));
    });

    it('калибрует масштаб по отрезку', () => {
        const store = useEditorStore.getState();
        expect(store.calibrateScale(300, 900)).toBe(true);
        expect(useEditorStore.getState().graph.floorPlan.scaleMetersPerPx).toBeCloseTo(0.003);
        expect(store.calibrateScale(0, 900)).toBe(false);
    });

    it('добавляет ЭУИ и переводит координаты в метры', () => {
        useEditorStore.getState().calibrateScale(100, 1000);
        useEditorStore.getState().addNode('socket', { x: 200, y: 50 });
        const nodes = useEditorStore.getState().graph.nodes;
        expect(nodes).toHaveLength(1);
        expect(nodes[0]?.kind).toBe('socket');
        expect(nodes[0]?.planPosition).toEqual({ x: 2, y: 0.5 });
        expect(useEditorStore.getState().selectedNodeId).toBe(nodes[0]?.id);
    });

    it('создаёт зону из валидного контура', () => {
        const store = useEditorStore.getState();
        store.calibrateScale(100, 1000);
        store.setRoomDraftKind('kitchen');
        store.addRoomVertex({ x: 0, y: 0 });
        store.addRoomVertex({ x: 100, y: 0 });
        store.addRoomVertex({ x: 100, y: 100 });
        store.addRoomVertex({ x: 0, y: 100 });
        expect(store.finishRoom()).toBe(true);
        const room = useEditorStore.getState().graph.rooms[0];
        expect(room?.type).toBe('kitchen');
        expect(room?.polygon).toHaveLength(4);
        expect(room?.polygon[1]).toEqual({ x: 1, y: 0 });
    });

    it('создаёт кабельную трассу с метаданными', () => {
        const store = useEditorStore.getState();
        store.addNode('panel', { x: 0, y: 0 });
        const panelId = useEditorStore.getState().selectedNodeId;
        expect(panelId).not.toBeNull();
        store.addNode('socket', { x: 300, y: 200 });
        const socketId = useEditorStore.getState().selectedNodeId;
        expect(socketId).not.toBeNull();
        if (panelId === null || socketId === null) {
            return;
        }
        store.startCable(panelId);
        store.addCableWaypoint({ x: 150, y: 0 });
        expect(store.finishCable(socketId)).toBe(true);
        const edge = useEditorStore.getState().graph.edges[0];
        expect(edge?.from).toBe(panelId);
        expect(edge?.to).toBe(socketId);
        expect(edge?.edgeType).toBe('cable_line');
        expect(edge?.cableBrand).toBe('ВВГнг(А)-LS');
        expect(edge?.cableSpecs.conductorCount).toBe(3);
        expect(edge?.cableSpecs.crossSection).toBe(1.5);
        expect(edge?.waypointsPx).toHaveLength(2);
    });

    it('удаляет связанные линии при удалении узла', () => {
        const store = useEditorStore.getState();
        store.addNode('panel', { x: 0, y: 0 });
        const panelId = useEditorStore.getState().selectedNodeId;
        store.addNode('socket', { x: 100, y: 100 });
        const socketId = useEditorStore.getState().selectedNodeId;
        if (panelId === null || socketId === null) {
            return;
        }
        store.startCable(panelId);
        store.finishCable(socketId);
        expect(useEditorStore.getState().graph.edges).toHaveLength(1);
        store.selectNode(panelId);
        store.deleteSelected();
        expect(useEditorStore.getState().graph.edges).toHaveLength(0);
    });
});
