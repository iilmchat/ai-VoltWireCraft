// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { createEmptyProjectGraph } from '@voltwirecraft/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editorStore.js';

describe('editorStore', () => {
    beforeEach(() => {
        useEditorStore.getState().setGraph(createEmptyProjectGraph('Тест'));
    });

    it('калибрует масштаб по длине отрезка', () => {
        const store = useEditorStore.getState();
        expect(store.calibrateScale(300, 900)).toBe(true);
        expect(useEditorStore.getState().graph.floorPlan.scaleMetersPerPx).toBeCloseTo(0.003);
        expect(store.calibrateScale(0, 900)).toBe(false);
    });

    it('добавляет ЭУИ и переводит координаты в метры', () => {
        useEditorStore.getState().calibrateScale(100, 1000);
        useEditorStore.getState().addDevice('socket', { x: 200, y: 50 });
        const devices = useEditorStore.getState().graph.devices;
        expect(devices).toHaveLength(1);
        expect(devices[0]?.kind).toBe('socket');
        expect(devices[0]?.position).toEqual({ x: 2, y: 0.5 });
        expect(useEditorStore.getState().selectedDeviceId).toBe(devices[0]?.id);
    });

    it('создаёт помещение из валидного контура', () => {
        const store = useEditorStore.getState();
        store.calibrateScale(100, 1000);
        store.setRoomDraftType('kitchen');
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

    it('отвергает вырожденный контур', () => {
        const store = useEditorStore.getState();
        store.addRoomVertex({ x: 0, y: 0 });
        store.addRoomVertex({ x: 1, y: 1 });
        store.addRoomVertex({ x: 2, y: 2 });
        expect(store.finishRoom()).toBe(false);
        expect(useEditorStore.getState().graph.rooms).toHaveLength(0);
    });

    it('удаляет выбранное ЭУИ', () => {
        const store = useEditorStore.getState();
        store.addDevice('panel', { x: 10, y: 10 });
        const id = useEditorStore.getState().selectedDeviceId;
        expect(id).not.toBeNull();
        store.deleteSelected();
        expect(useEditorStore.getState().graph.devices).toHaveLength(0);
    });
});
