// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import {
    CABLE_LINE_EDGE_TYPE,
    GraphEdgeSchema,
    GraphNodeSchema,
    ProjectGraphSchema,
    RoomZoneSchema,
    createEmptyProjectGraph,
} from '@voltwirecraft/shared/graph.schema.js';
import type {
    Background,
    GraphNode,
    Point,
    ProjectGraph,
    RoomZone,
    RoomZoneType,
} from '@voltwirecraft/shared/graph.schema.js';
import { create } from 'zustand';
import type { TranslationKey } from '../i18n/index.js';
import type { ScreenPoint, Viewport } from '../lib/geometry.js';
import { effectiveScale, isValidPolygon, metersToPx, pxToMeters } from '../lib/geometry.js';
import { snapToWalls } from '../lib/snap.js';

/** Идентификатор активного инструмента. */
export type ToolId = 'select' | 'scale' | 'room' | 'device' | 'cable';

/** Тип ЭУИ в палитре интерфейса (подмножество канонических УГО). */
export type UiDeviceKind = 'panel' | 'socket' | 'switch' | 'light_fixture' | 'appliance';

/** Тип помещения, доступный в палитре интерфейса. */
export type UiRoomKind = Extract<RoomZoneType, 'living' | 'wet' | 'kitchen' | 'outdoor' | 'utility'>;

/** Масштаб до калибровки: 1 пикс = 1 мм. */
export const DEFAULT_SCALE_METERS_PER_PX = 0.001;

/** Нарисованный отрезок для калибровки в пикселях подложки. */
export interface DraftLine {
    /** Начало отрезка. */
    start: ScreenPoint;
    /** Конец отрезка. */
    end: ScreenPoint;
}

/** Незавершённая кабельная трасса. */
export interface CableDraft {
    /** Идентификатор узла-источника. */
    sourceNodeId: string;
    /** Промежуточные точки в пикселях подложки. */
    waypointsPx: ScreenPoint[];
}

/** Изменяемые поля узла для инспектора. */
export type NodePatch = {
    /** УГО / подпись узла. */
    label?: string;
    /** Номинальная мощность, Вт. */
    ratedPower?: number;
    /** Номинальный ток, А. */
    ratedCurrent?: number;
    /** Высота установки, м. */
    mountingHeight?: number;
    /** Привязка к зоне помещения. */
    roomId?: string | null;
};

/** Изменяемые поля зоны помещения. */
export type RoomPatch = Partial<Pick<RoomZone, 'name' | 'type'>>;

/** Изменяемые поля кабельной линии. */
export type EdgePatch = {
    /** Сечение жилы, мм². */
    crossSection?: number;
    /** Число жил. */
    conductorCount?: number;
    /** Марка кабеля. */
    cableBrand?: string;
};

/** Состояние редактора плана. */
export interface EditorState {
    /** Канонический граф — единственный источник истины (RULES § 5.2). */
    graph: ProjectGraph;
    /** Идентификатор проекта на сервере, null для офлайн-проекта. */
    serverProjectId: string | null;
    /** Активный инструмент. */
    tool: ToolId;
    /** ЭУИ, подготовленное к установке кликом. */
    armedDeviceKind: UiDeviceKind | null;
    /** Тип нового помещения. */
    roomDraftKind: UiRoomKind;
    /** Вершины незавершённого контура в пикселях. */
    roomDraft: ScreenPoint[];
    /** Отрезок калибровки в пикселях. */
    scaleDraft: DraftLine | null;
    /** Незавершённая кабельная трасса. */
    cableDraft: CableDraft | null;
    /** Идентификатор выбранного узла. */
    selectedNodeId: string | null;
    /** Идентификатор выбранной зоны. */
    selectedRoomId: string | null;
    /** Идентификатор выбранной линии. */
    selectedEdgeId: string | null;
    /** Параметры просмотра холста. */
    viewport: Viewport;
    /** Растр подложки (время жизни вкладки). */
    backgroundImage: HTMLImageElement | HTMLCanvasElement | null;
    /** Ключ строки статуса. */
    statusKey: TranslationKey;
    /** Выбрать инструмент. */
    setTool: (tool: ToolId) => void;
    /** Подготовить ЭУИ к установке. */
    setArmedDeviceKind: (kind: UiDeviceKind | null) => void;
    /** Выбрать тип нового помещения. */
    setRoomDraftKind: (kind: UiRoomKind) => void;
    /** Задать параметры просмотра. */
    setViewport: (viewport: Viewport) => void;
    /** Вписать подложку в холст. */
    fitView: (containerWidth: number, containerHeight: number) => void;
    /** Установить подложку плана. */
    setBackground: (background: Background, image: HTMLImageElement | HTMLCanvasElement) => void;
    /** Установить растр подложки после загрузки проекта. */
    setBackgroundImage: (image: HTMLImageElement | HTMLCanvasElement | null) => void;
    /** Сохранить масштаб по отрезку и реальной длине в мм. */
    calibrateScale: (lengthPx: number, realLengthMm: number) => boolean;
    /** Установить отрезок калибровки. */
    setScaleDraft: (draft: DraftLine | null) => void;
    /** Добавить вершину контура помещения. */
    addRoomVertex: (point: ScreenPoint) => void;
    /** Удалить последнюю вершину контура. */
    popRoomVertex: () => void;
    /** Сбросить контур помещения. */
    clearRoomDraft: () => void;
    /** Замкнуть контур и создать зону. */
    finishRoom: () => boolean;
    /** Установить ЭУИ на плане. */
    addNode: (kind: UiDeviceKind, point: ScreenPoint) => void;
    /** Переместить узел. */
    moveNode: (id: string, point: ScreenPoint) => void;
    /** Обновить свойства узла. */
    updateNode: (id: string, patch: NodePatch) => void;
    /** Обновить свойства зоны. */
    updateRoom: (id: string, patch: RoomPatch) => void;
    /** Обновить параметры кабеля. */
    updateEdge: (id: string, patch: EdgePatch) => void;
    /** Начать трассировку от узла-источника. */
    startCable: (sourceNodeId: string) => void;
    /** Добавить поворотную точку трассы. */
    addCableWaypoint: (point: ScreenPoint) => void;
    /** Завершить трассировку на узле-приёмнике. */
    finishCable: (targetNodeId: string) => boolean;
    /** Отменить трассировку. */
    cancelCable: () => void;
    /** Выбрать узел. */
    selectNode: (id: string | null) => void;
    /** Выбрать зону. */
    selectRoom: (id: string | null) => void;
    /** Выбрать линию. */
    selectEdge: (id: string | null) => void;
    /** Удалить выбранный элемент. */
    deleteSelected: () => void;
    /** Переименовать проект. */
    setProjectName: (name: string) => void;
    /** Заменить граф проекта. */
    setGraph: (graph: ProjectGraph) => void;
    /** Запомнить идентификатор серверного проекта. */
    setServerProjectId: (id: string | null) => void;
    /** Установить ключ статуса. */
    setStatus: (key: TranslationKey) => void;
}

/** Начальные параметры просмотра. */
const INITIAL_VIEWPORT: Viewport = { x: 40, y: 40, scale: 1 };

/**
 * Проверить, что узел может быть источником кабельной линии.
 * @param node Узел графа.
 * @returns true для щита, источника или УЗО/автомата.
 */
function canSourceCable(node: GraphNode): boolean {
    return ['panel', 'input_source', 'circuit_breaker', 'rcd', 'rcbo'].includes(node.kind);
}

/**
 * Проверить, что узел может быть приёмником кабельной линии.
 * @param node Узел графа.
 * @returns true для розетки, светильника, выключателя, прибора или нагрузки.
 */
function canTargetCable(node: GraphNode): boolean {
    return ['socket', 'light_fixture', 'switch', 'appliance'].includes(node.kind);
}

/**
 * Хранилище редактора плана.
 * @returns Zustand-хранилище с пустым каноническим графом.
 */
export const useEditorStore = create<EditorState>((set, get) => ({
    graph: createEmptyProjectGraph(),
    serverProjectId: null,
    tool: 'select',
    armedDeviceKind: null,
    roomDraftKind: 'living',
    roomDraft: [],
    scaleDraft: null,
    cableDraft: null,
    selectedNodeId: null,
    selectedRoomId: null,
    selectedEdgeId: null,
    viewport: INITIAL_VIEWPORT,
    backgroundImage: null,
    statusKey: 'status.ready',

    setTool: (tool) => set({ tool, statusKey: 'status.ready' }),
    setArmedDeviceKind: (armedDeviceKind) => set({ armedDeviceKind, tool: 'device' }),
    setRoomDraftKind: (roomDraftKind) => set({ roomDraftKind }),
    setViewport: (viewport) => set({ viewport }),

    fitView: (containerWidth, containerHeight) => {
        const background = get().graph.floorPlan.background;
        const width = background?.widthPx ?? 1000;
        const height = background?.heightPx ?? 700;
        const scale = Math.min((containerWidth - 48) / width, (containerHeight - 48) / height, 1);
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

    addRoomVertex: (point) => set((state) => ({ roomDraft: [...state.roomDraft, point] })),

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
            type: state.roomDraftKind,
            polygon: state.roomDraft.map((point) => pxToMeters(point, scale)),
        });
        set({
            graph: ProjectGraphSchema.parse({ ...state.graph, rooms: [...state.graph.rooms, room] }),
            roomDraft: [],
            selectedRoomId: room.id,
            selectedNodeId: null,
            selectedEdgeId: null,
            statusKey: 'status.roomCreated',
        });
        return true;
    },

    addNode: (kind, point) => {
        const state = get();
        const scale = state.graph.floorPlan.scaleMetersPerPx;
        const defaults: Record<UiDeviceKind, {
            label: string;
            ratedPower: number;
            ratedCurrent: number;
            crossSection: number;
            mountingHeight: number;
        }> = {
            panel: { label: 'Щит НКУ', ratedPower: 0, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 1.5 },
            socket: { label: 'Розетка', ratedPower: 0, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0.3 },
            switch: { label: 'Выключатель', ratedPower: 0, ratedCurrent: 6, crossSection: 1.5, mountingHeight: 1.2 },
            light_fixture: { label: 'Светильник', ratedPower: 60, ratedCurrent: 6, crossSection: 1.5, mountingHeight: 2.5 },
            appliance: { label: 'Прибор', ratedPower: 1000, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0 },
        };
        const snapped = snapToWalls(point, state.graph.walls, scale);
        const node = GraphNodeSchema.parse({
            id: crypto.randomUUID(),
            kind,
            label: defaults[kind].label,
            planPosition: pxToMeters(snapped, scale),
            panelSlot: null,
            roomId: null,
            specs: {
                ratedPower: defaults[kind].ratedPower,
                ratedCurrent: defaults[kind].ratedCurrent,
                crossSection: defaults[kind].crossSection,
                mountingHeight: defaults[kind].mountingHeight,
            },
        });
        set({
            graph: ProjectGraphSchema.parse({ ...state.graph, nodes: [...state.graph.nodes, node] }),
            selectedNodeId: node.id,
            selectedRoomId: null,
            selectedEdgeId: null,
            statusKey: 'status.devicePlaced',
        });
    },

    moveNode: (id, point) => {
        const state = get();
        const scale = state.graph.floorPlan.scaleMetersPerPx;
        const planPosition = pxToMeters(snapToWalls(point, state.graph.walls, scale), scale);
        set({
            graph: ProjectGraphSchema.parse({
                ...state.graph,
                nodes: state.graph.nodes.map((node) =>
                    node.id === id ? GraphNodeSchema.parse({ ...node, planPosition }) : node,
                ),
            }),
        });
    },

    updateNode: (id, patch) => set((state) => ({
        graph: ProjectGraphSchema.parse({
            ...state.graph,
            nodes: state.graph.nodes.map((node) => {
                if (node.id !== id) {
                    return node;
                }
                const specs = {
                    ...node.specs,
                    ...(patch.ratedPower !== undefined ? { ratedPower: patch.ratedPower } : {}),
                    ...(patch.ratedCurrent !== undefined ? { ratedCurrent: patch.ratedCurrent } : {}),
                    ...(patch.mountingHeight !== undefined ? { mountingHeight: patch.mountingHeight } : {}),
                };
                return GraphNodeSchema.parse({
                    ...node,
                    ...(patch.label !== undefined ? { label: patch.label } : {}),
                    ...(patch.roomId !== undefined ? { roomId: patch.roomId } : {}),
                    specs,
                });
            }),
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

    updateEdge: (id, patch) => set((state) => ({
        graph: ProjectGraphSchema.parse({
            ...state.graph,
            edges: state.graph.edges.map((edge) => {
                if (edge.id !== id) {
                    return edge;
                }
                const cableSpecs = {
                    ...edge.cableSpecs,
                    ...(patch.crossSection !== undefined ? { crossSection: patch.crossSection } : {}),
                    ...(patch.conductorCount !== undefined ? { conductorCount: patch.conductorCount } : {}),
                };
                return GraphEdgeSchema.parse({
                    ...edge,
                    cableSpecs,
                    ...(patch.cableBrand !== undefined ? { cableBrand: patch.cableBrand } : {}),
                });
            }),
        }),
    })),

    startCable: (sourceNodeId) => {
        const node = get().graph.nodes.find((item) => item.id === sourceNodeId);
        if (node === undefined || !canSourceCable(node)) {
            set({ statusKey: 'cable.invalidSource' });
            return;
        }
        set({
            tool: 'cable',
            cableDraft: { sourceNodeId, waypointsPx: [] },
            statusKey: 'cable.waypointHint',
        });
    },

    addCableWaypoint: (point) => set((state) => {
        if (state.cableDraft === null) {
            return {};
        }
        return {
            cableDraft: {
                ...state.cableDraft,
                waypointsPx: [...state.cableDraft.waypointsPx, { x: point.x, y: point.y }],
            },
        };
    }),

    finishCable: (targetNodeId) => {
        const state = get();
        const draft = state.cableDraft;
        if (draft === null || draft.sourceNodeId === targetNodeId) {
            return false;
        }
        const target = state.graph.nodes.find((node) => node.id === targetNodeId);
        if (target === undefined || !canTargetCable(target)) {
            set({ statusKey: 'cable.invalidTarget' });
            return false;
        }
        const targetPx = target.planPosition === null
            ? (draft.waypointsPx[draft.waypointsPx.length - 1] ?? { x: 0, y: 0 })
            : metersToPx(target.planPosition, state.graph.floorPlan.scaleMetersPerPx);
        const source = state.graph.nodes.find((node) => node.id === draft.sourceNodeId);
        const sourcePx = source?.planPosition === null || source === undefined
            ? (draft.waypointsPx[0] ?? { x: 0, y: 0 })
            : metersToPx(source.planPosition, state.graph.floorPlan.scaleMetersPerPx);
        const waypointsPx = [
            { x: sourcePx.x, y: sourcePx.y },
            ...draft.waypointsPx.map((point) => ({ x: point.x, y: point.y })),
            { x: targetPx.x, y: targetPx.y },
        ];
        const scale = state.graph.floorPlan.scaleMetersPerPx;
        const edge = GraphEdgeSchema.parse({
            id: crypto.randomUUID(),
            from: draft.sourceNodeId,
            to: targetNodeId,
            cableSpecs: {
                crossSection: 1.5,
                conductorCount: 3,
                material: 'cu',
                length: 0,
            },
            waypointsPx,
            waypointsM: waypointsPx.map((point) => pxToMeters(point, scale)),
            edgeType: CABLE_LINE_EDGE_TYPE,
            cableBrand: 'ВВГнг(А)-LS',
        });
        set({
            graph: ProjectGraphSchema.parse({ ...state.graph, edges: [...state.graph.edges, edge] }),
            cableDraft: null,
            selectedEdgeId: edge.id,
            selectedNodeId: null,
            selectedRoomId: null,
            statusKey: 'status.cableCreated',
        });
        return true;
    },

    cancelCable: () => set({ cableDraft: null }),

    selectNode: (id) => set({ selectedNodeId: id, selectedRoomId: null, selectedEdgeId: null }),
    selectRoom: (id) => set({ selectedRoomId: id, selectedNodeId: null, selectedEdgeId: null }),
    selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null, selectedRoomId: null }),

    deleteSelected: () => set((state) => {
        if (state.selectedNodeId !== null) {
            const id = state.selectedNodeId;
            return {
                graph: ProjectGraphSchema.parse({
                    ...state.graph,
                    nodes: state.graph.nodes.filter((node) => node.id !== id),
                    edges: state.graph.edges.filter((edge) => edge.from !== id && edge.to !== id),
                }),
                selectedNodeId: null,
            };
        }
        if (state.selectedRoomId !== null) {
            const id = state.selectedRoomId;
            return {
                graph: ProjectGraphSchema.parse({
                    ...state.graph,
                    rooms: state.graph.rooms.filter((room) => room.id !== id),
                    nodes: state.graph.nodes.map((node) =>
                        node.roomId === id ? { ...node, roomId: null } : node,
                    ),
                }),
                selectedRoomId: null,
            };
        }
        if (state.selectedEdgeId !== null) {
            return {
                graph: ProjectGraphSchema.parse({
                    ...state.graph,
                    edges: state.graph.edges.filter((edge) => edge.id !== state.selectedEdgeId),
                }),
                selectedEdgeId: null,
            };
        }
        return {};
    }),

    setProjectName: (name) => set((state) => ({
        graph: ProjectGraphSchema.parse({ ...state.graph, name: name.length > 0 ? name : 'Проект' }),
    })),

    setGraph: (graph) => set({
        graph: ProjectGraphSchema.parse(graph),
        serverProjectId: null,
        backgroundImage: null,
        selectedNodeId: null,
        selectedRoomId: null,
        selectedEdgeId: null,
        roomDraft: [],
        scaleDraft: null,
        cableDraft: null,
        statusKey: 'status.projectLoaded',
    }),

    setServerProjectId: (serverProjectId) => set({ serverProjectId }),
    setStatus: (statusKey) => set({ statusKey }),
}));

/**
 * Перевести точку из пикселей в метры через масштаб плана.
 * @param point Точка в пикселях.
 * @param scale Масштаб метры/пикс.
 * @returns Точка в метрах.
 */
export function toMeters(point: ScreenPoint, scale: number | null): Point {
    return pxToMeters(point, scale);
}

/**
 * Получить эффективный масштаб плана.
 * @param scale Масштаб из графа.
 * @returns Положительный масштаб.
 */
export function planScale(scale: number | null): number {
    return effectiveScale(scale);
}
