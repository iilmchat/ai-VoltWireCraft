// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import {
    ElectricalDeviceSchema,
    ProjectGraphSchema,
    RoomZoneSchema,
    createEmptyProjectGraph,
} from '@voltwirecraft/shared';
import type {
    Background,
    DeviceKind,
    ElectricalDevice,
    ProjectGraph,
    RoomType,
    RoomZone,
} from '@voltwirecraft/shared';
import { create } from 'zustand';
import type { TranslationKey } from '../i18n/index.js';
import type { ScreenPoint, Viewport } from '../lib/geometry.js';
import { DEFAULT_SCALE_METERS_PER_PX, isValidPolygon, pxToMeters } from '../lib/geometry.js';

/** Идентификатор активного инструмента. */
export type ToolId = 'select' | 'scale' | 'room' | 'device';

/** Нарисованный отрезок для калибровки (в пикселях подложки). */
export interface DraftLine {
    /** Начало отрезка. */
    start: ScreenPoint;
    /** Конец отрезка. */
    end: ScreenPoint;
}

/** Изменяемые поля ЭУИ в инспекторе. */
export type DevicePatch = Partial<
    Pick<ElectricalDevice, 'ugo' | 'powerW' | 'mountingHeightM' | 'roomId'>
>;

/** Изменяемые поля помещения в инспекторе. */
export type RoomPatch = Partial<Pick<RoomZone, 'name' | 'type'>>;

/** Состояние редактора плана. */
export interface EditorState {
    /** Граф проекта — единственный источник истины (RULES § 5.2). */
    graph: ProjectGraph;
    /** Активный инструмент. */
    tool: ToolId;
    /** ЭУИ, подготовленное к установке кликом. */
    armedDeviceKind: DeviceKind | null;
    /** Тип нового помещения. */
    roomDraftType: RoomType;
    /** Вершины незавершённого контура помещения (пиксели). */
    roomDraft: ScreenPoint[];
    /** Отрезок калибровки (пиксели). */
    scaleDraft: DraftLine | null;
    /** Идентификатор выбранного ЭУИ. */
    selectedDeviceId: string | null;
    /** Идентификатор выбранного помещения. */
    selectedRoomId: string | null;
    /** Параметры просмотра холста. */
    viewport: Viewport;
    /** Растр подложки (только время жизни вкладки). */
    backgroundImage: HTMLImageElement | HTMLCanvasElement | null;
    /** Ключ строки статуса для панели. */
    statusKey: TranslationKey;
    /** Выбрать инструмент. */
    setTool: (tool: ToolId) => void;
    /** Подготовить ЭУИ к установке. */
    setArmedDeviceKind: (kind: DeviceKind | null) => void;
    /** Выбрать тип нового помещения. */
    setRoomDraftType: (type: RoomType) => void;
    /** Задать параметры просмотра. */
    setViewport: (viewport: Viewport) => void;
    /** Вписать подложку в область холста. */
    fitView: (containerWidth: number, containerHeight: number) => void;
    /** Установить описание подложки и её растр. */
    setBackground: (background: Background, image: HTMLImageElement | HTMLCanvasElement) => void;
    /** Установить только растр подложки (при загрузке проекта). */
    setBackgroundImage: (image: HTMLImageElement | HTMLCanvasElement | null) => void;
    /** Сохранить масштаб по длине отрезка и реальной длине. */
    calibrateScale: (lengthPx: number, realLengthMm: number) => boolean;
    /** Начать/продолжить отрезок калибровки. */
    setScaleDraft: (draft: DraftLine | null) => void;
    /** Добавить вершину контура помещения. */
    addRoomVertex: (point: ScreenPoint) => void;
    /** Удалить последнюю вершину контура. */
    popRoomVertex: () => void;
    /** Сбросить незавершённый контур. */
    clearRoomDraft: () => void;
    /** Замкнуть контур и создать помещение. */
    finishRoom: () => boolean;
    /** Установить ЭУИ в точке подложки. */
    addDevice: (kind: DeviceKind, point: ScreenPoint) => void;
    /** Переместить ЭУИ в точку подложки. */
    moveDevice: (id: string, point: ScreenPoint) => void;
    /** Обновить свойства ЭУИ. */
    updateDevice: (id: string, patch: DevicePatch) => void;
    /** Обновить свойства помещения. */
    updateRoom: (id: string, patch: RoomPatch) => void;
    /** Выбрать ЭУИ. */
    selectDevice: (id: string | null) => void;
    /** Выбрать помещение. */
    selectRoom: (id: string | null) => void;
    /** Удалить выбранный элемент. */
    deleteSelected: () => void;
    /** Переименовать проект. */
    setProjectName: (name: string) => void;
    /** Заменить граф проекта (импорт). */
    setGraph: (graph: ProjectGraph) => void;
    /** Установить ключ строки статуса. */
    setStatus: (key: TranslationKey) => void;
}

/** Начальные параметры просмотра. */
const INITIAL_VIEWPORT: Viewport = { x: 40, y: 40, scale: 1 };

/**
 * Создать хранилище редактора.
 * @returns Zustand-хранилище с начальным пустым графом.
 */
export const useEditorStore = create<EditorState>((set, get) => ({
    graph: createEmptyProjectGraph(),
    tool: 'select',
    armedDeviceKind: null,
    roomDraftType: 'living',
    roomDraft: [],
    scaleDraft: null,
    selectedDeviceId: null,
    selectedRoomId: null,
    viewport: INITIAL_VIEWPORT,
    backgroundImage: null,
    statusKey: 'status.ready',

    setTool: (tool) => set({ tool, statusKey: 'status.ready' }),
    setArmedDeviceKind: (armedDeviceKind) => set({ armedDeviceKind, tool: 'device' }),
    setRoomDraftType: (roomDraftType) => set({ roomDraftType }),
    setViewport: (viewport) => set({ viewport }),

    fitView: (containerWidth, containerHeight) => {
        const { graph } = get();
        const background = graph.floorPlan.background;
        const width = background?.widthPx ?? 1000;
        const height = background?.heightPx ?? 700;
        const scale = Math.min(
            (containerWidth - 48) / width,
            (containerHeight - 48) / height,
            1,
        );
        const safeScale = scale > 0 ? scale : DEFAULT_SCALE_METERS_PER_PX;
        set({
            viewport: {
                scale: safeScale,
                x: (containerWidth - width * safeScale) / 2,
                y: (containerHeight - height * safeScale) / 2,
            },
        });
    },

    setBackground: (background, image) => set((state) => ({
        graph: ProjectGraphSchema.parse({
            ...state.graph,
            floorPlan: { ...state.graph.floorPlan, background },
        }),
        backgroundImage: image,
        roomDraft: [],
        scaleDraft: null,
    })),

    setBackgroundImage: (backgroundImage) => set({ backgroundImage }),

    calibrateScale: (lengthPx, realLengthMm) => {
        if (!Number.isFinite(lengthPx) || !Number.isFinite(realLengthMm)) {
            return false;
        }
        if (lengthPx <= 0 || realLengthMm <= 0) {
            return false;
        }
        const scaleMetersPerPx = realLengthMm / 1000 / lengthPx;
        set((state) => ({
            graph: ProjectGraphSchema.parse({
                ...state.graph,
                floorPlan: { ...state.graph.floorPlan, scaleMetersPerPx },
            }),
            scaleDraft: null,
            statusKey: 'status.scaleSaved',
        }));
        return true;
    },

    setScaleDraft: (scaleDraft) => set({ scaleDraft }),

    addRoomVertex: (point) => set((state) => ({
        roomDraft: [...state.roomDraft, point],
    })),

    popRoomVertex: () => set((state) => ({ roomDraft: state.roomDraft.slice(0, -1) })),

    clearRoomDraft: () => set({ roomDraft: [] }),

    finishRoom: () => {
        const state = get();
        if (!isValidPolygon(state.roomDraft)) {
            return false;
        }
        const scale = state.graph.floorPlan.scaleMetersPerPx;
        const room = RoomZoneSchema.parse({
            id: crypto.randomUUID(),
            name: `Помещение ${state.graph.rooms.length + 1}`,
            type: state.roomDraftType,
            polygon: state.roomDraft.map((point) => pxToMeters(point, scale)),
        });
        set({
            graph: ProjectGraphSchema.parse({ ...state.graph, rooms: [...state.graph.rooms, room] }),
            roomDraft: [],
            selectedRoomId: room.id,
            selectedDeviceId: null,
            statusKey: 'status.roomCreated',
        });
        return true;
    },

    addDevice: (kind, point) => {
        const state = get();
        const scale = state.graph.floorPlan.scaleMetersPerPx;
        const defaults: Record<DeviceKind, { ugo: string; powerW: number; mountingHeightM: number }> = {
            panel: { ugo: 'Щит НКУ', powerW: 0, mountingHeightM: 1.5 },
            socket: { ugo: 'Розетка', powerW: 0, mountingHeightM: 0.3 },
            switch: { ugo: 'Выключатель', powerW: 0, mountingHeightM: 1.2 },
            light_fixture: { ugo: 'Светильник', powerW: 60, mountingHeightM: 2.5 },
            appliance: { ugo: 'Прибор', powerW: 1000, mountingHeightM: 0 },
        };
        const device = ElectricalDeviceSchema.parse({
            id: crypto.randomUUID(),
            kind,
            ...defaults[kind],
            position: pxToMeters(point, scale),
            roomId: null,
        });
        set({
            graph: ProjectGraphSchema.parse({
                ...state.graph,
                devices: [...state.graph.devices, device],
            }),
            selectedDeviceId: device.id,
            selectedRoomId: null,
            statusKey: 'status.devicePlaced',
        });
    },

    moveDevice: (id, point) => {
        const state = get();
        const scale = state.graph.floorPlan.scaleMetersPerPx;
        const position = pxToMeters(point, scale);
        set({
            graph: ProjectGraphSchema.parse({
                ...state.graph,
                devices: state.graph.devices.map((device) =>
                    device.id === id ? { ...device, position } : device,
                ),
            }),
        });
    },

    updateDevice: (id, patch) => set((state) => ({
        graph: ProjectGraphSchema.parse({
            ...state.graph,
            devices: state.graph.devices.map((device) =>
                device.id === id ? ElectricalDeviceSchema.parse({ ...device, ...patch }) : device,
            ),
        }),
    })),

    updateRoom: (id, patch) => set((state) => ({
        graph: ProjectGraphSchema.parse({
            ...state.graph,
            rooms: state.graph.rooms.map((room) =>
                room.id === id ? RoomZoneSchema.parse({ ...room, ...patch }) : room,
            ),
        }),
    })),

    selectDevice: (id) => set({ selectedDeviceId: id, selectedRoomId: null }),
    selectRoom: (id) => set({ selectedRoomId: id, selectedDeviceId: null }),

    deleteSelected: () => set((state) => {
        if (state.selectedDeviceId !== null) {
            return {
                graph: ProjectGraphSchema.parse({
                    ...state.graph,
                    devices: state.graph.devices.filter((device) => device.id !== state.selectedDeviceId),
                }),
                selectedDeviceId: null,
            };
        }
        if (state.selectedRoomId !== null) {
            return {
                graph: ProjectGraphSchema.parse({
                    ...state.graph,
                    rooms: state.graph.rooms.filter((room) => room.id !== state.selectedRoomId),
                    devices: state.graph.devices.map((device) =>
                        device.roomId === state.selectedRoomId ? { ...device, roomId: null } : device,
                    ),
                }),
                selectedRoomId: null,
            };
        }
        return {};
    }),

    setProjectName: (name) => set((state) => ({
        graph: ProjectGraphSchema.parse({ ...state.graph, name: name.length > 0 ? name : 'Проект' }),
    })),

    setGraph: (graph) => set({
        graph: ProjectGraphSchema.parse(graph),
        backgroundImage: null,
        selectedDeviceId: null,
        selectedRoomId: null,
        roomDraft: [],
        scaleDraft: null,
        statusKey: 'status.projectLoaded',
    }),

    setStatus: (statusKey) => set({ statusKey }),
}));
