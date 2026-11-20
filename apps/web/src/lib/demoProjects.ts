// © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
/**
 * Золотой датасет: три эталонных проекта, доступных без сети (RULES § 5.4).
 * Каждый кейс строится как канонический `ProjectGraph` — общий источник истины
 * для плана, щита, схемы, спецификации, 3D-вида и комплекта РД (RULES § 5.2).
 */
import {
    CABLE_LINE_EDGE_TYPE,
    ProjectGraphSchema,
} from '@voltwirecraft/shared/graph.schema.js';
import type {
    GraphEdge,
    GraphNode,
    NodeKind,
    Point,
    ProjectGraph,
    RoomZone,
    Uuid,
    Wall,
} from '@voltwirecraft/shared/graph.schema.js';
import type { TranslationKey } from '../i18n/index.js';

/** Идентификатор эталонного проекта золотого датасета. */
export type DemoProjectId = 'studio-230v' | 'apartment-3room-400v' | 'house-bath-80m';

/** Описание эталонного проекта. */
export interface DemoProjectDefinition {
    /** Стабильный идентификатор кейса. */
    id: DemoProjectId;
    /** Ключ названия в i18n. */
    nameKey: TranslationKey;
    /** Ключ краткого описания в i18n. */
    descriptionKey: TranslationKey;
    /** Создать свежий граф (каждый вызов возвращает независимый объект). */
    createGraph: () => ProjectGraph;
}

/** Детерминированный UUID золотого датасета: стабилен между сессиями и сборками. */
function demoUuid(prefix: string, index: number): Uuid {
    return `${prefix}-4000-8000-${String(index).padStart(12, '0')}` as Uuid;
}

/** Параметры узла эталонного графа. */
interface DemoNodeInput {
    /** Локальный ключ для ссылок. */
    key: string;
    /** УГО узла. */
    kind: NodeKind;
    /** Подпись. */
    label: string;
    /** Слот в щите; `null` — вне щита. */
    slot: number | null;
    /** Положение на плане, м. */
    position: readonly [number, number] | null;
    /** Мощность, Вт. */
    power?: number;
    /** Номинальный ток, А. */
    current?: number;
    /** Сечение жилы, мм². */
    crossSection?: number;
    /** Идентификатор зоны. */
    room?: string;
}

/** Параметры кабельной линии эталонного графа. */
interface DemoEdgeInput {
    /** Ключ источника. */
    from: string;
    /** Ключ приёмника. */
    to: string;
    /** Сечение жилы, мм². */
    crossSection?: number;
    /** Марка кабеля. */
    brand?: string;
    /** Точки трассы в метрах (по умолчанию — прямая между узлами). */
    waypoints?: readonly (readonly [number, number])[];
}

/** Результат сборки эталонного графа. */
interface DemoGraphParts {
    /** Название проекта. */
    name: string;
    /** Префикс UUID. */
    prefix: string;
    /** Зоны помещений. */
    rooms: readonly { key: string; name: string; type: RoomZone['type']; polygon: readonly (readonly [number, number])[] }[];
    /** Стены. */
    walls?: readonly (readonly (readonly [number, number])[])[];
    /** Узлы. */
    nodes: readonly DemoNodeInput[];
    /** Кабельные линии. */
    edges: readonly DemoEdgeInput[];
    /** Масштаб плана, м/пикс. */
    scale?: number;
}

/**
 * Собрать валидированный граф из декларативного описания кейса.
 * @param parts Описание эталонного проекта.
 * @returns Канонический `ProjectGraph` версии 2.
 */
function buildGraph(parts: DemoGraphParts): ProjectGraph {
    const roomIds = new Map(parts.rooms.map((room, index) => [room.key, demoUuid(parts.prefix, 100 + index)]));
    const rooms: RoomZone[] = parts.rooms.map((room, index) => ({
        id: roomIds.get(room.key) ?? demoUuid(parts.prefix, 100 + index),
        name: room.name,
        type: room.type,
        polygon: room.polygon.map(([x, y]) => ({ x, y })),
    }));
    const walls: Wall[] = (parts.walls ?? []).map((path, index) => ({
        id: demoUuid(parts.prefix, 200 + index),
        kind: path.length > 2 ? 'wall' : 'partition',
        path: path.map(([x, y]) => ({ x, y })),
        thickness: 0.2,
    }));
    const nodeIds = new Map(parts.nodes.map((node, index) => [node.key, demoUuid(parts.prefix, 300 + index)]));
    const nodes: GraphNode[] = parts.nodes.map((node, index) => ({
        id: nodeIds.get(node.key) ?? demoUuid(parts.prefix, 300 + index),
        kind: node.kind,
        label: node.label,
        planPosition: node.position === null ? null : { x: node.position[0], y: node.position[1] },
        panelSlot: node.slot,
        roomId: node.room === undefined ? null : roomIds.get(node.room) ?? null,
        catalogDeviceId: null,
        specs: {
            ratedPower: node.power ?? 0,
            ratedCurrent: node.current ?? 16,
            crossSection: node.crossSection ?? 2.5,
            mountingHeight: node.kind === 'socket' ? 0.3 : node.kind === 'light_fixture' ? 2.5 : 1.5,
        },
    }));
    const edges: GraphEdge[] = parts.edges.map((edge, index) => {
        const fromId = nodeIds.get(edge.from);
        const toId = nodeIds.get(edge.to);
        if (fromId === undefined || toId === undefined) {
            throw new Error(`Неизвестный узел в эталонном графе: ${edge.from} → ${edge.to}`);
        }
        const source = nodes.find((node) => node.id === fromId);
        const target = nodes.find((node) => node.id === toId);
        const start = source?.planPosition ?? { x: 0, y: 0 };
        const end = target?.planPosition ?? { x: 0, y: 0 };
        const asPair = (point: Point | readonly [number, number]): readonly [number, number] =>
            'x' in point ? [point.x, point.y] : point;
        const waypointsM = (edge.waypoints ?? [asPair(start), asPair(end)]).map(([x, y]) => ({ x, y }));
        return {
            id: demoUuid(parts.prefix, 600 + index),
            from: fromId,
            to: toId,
            cableSpecs: {
                crossSection: edge.crossSection ?? 2.5,
                conductorCount: 3,
                material: 'cu',
                length: 0,
            },
            waypointsM,
            edgeType: CABLE_LINE_EDGE_TYPE,
            cableBrand: edge.brand ?? 'ВВГнг(А)-LS',
        };
    });

    return ProjectGraphSchema.parse({
        schemaVersion: 2,
        id: demoUuid(parts.prefix, 0),
        name: parts.name,
        floorPlan: {
            background: null,
            scaleMetersPerPx: parts.scale ?? 0.01,
            ceilingHeightM: 2.7,
        },
        rooms,
        walls,
        nodes,
        edges,
        stampMeta: {
            projectCode: `${parts.prefix.slice(0, 4)}-ЭО`,
            designerName: 'Иванов И.И.',
            reviewerName: 'Петров П.П.',
            organizationName: 'ООО «ВолтВайрКрафт»',
            stage: 'РД',
        },
    });
}

/** Студия 230 В: компактный однокомнатный объект с совмещённым санузлом. */
const STUDIO_PARTS: DemoGraphParts = {
    name: 'Студия 230 В',
    prefix: '10000000-0000',
    scale: 0.01,
    rooms: [
        { key: 'studio', name: 'Студия', type: 'living', polygon: [[0, 0], [6, 0], [6, 4], [0, 4]] },
        { key: 'wet', name: 'Санузел', type: 'wet', polygon: [[6, 0], [8, 0], [8, 4], [6, 4]] },
    ],
    walls: [
        [[0, 0], [8, 0], [8, 4], [0, 4], [0, 0]],
        [[6, 0], [6, 4]],
    ],
    nodes: [
        { key: 'input', kind: 'input_source', label: 'Ввод 230 В', slot: 1, position: null, current: 40 },
        { key: 'panel', kind: 'panel', label: 'Щит НКУ', slot: 2, position: [0.3, 2], current: 40 },
        { key: 'rcd', kind: 'rcd', label: 'УЗО 30 мА', slot: 3, position: null, current: 25 },
        { key: 'q1', kind: 'circuit_breaker', label: 'QF1 Освещение', slot: 4, position: null, current: 10 },
        { key: 'q2', kind: 'circuit_breaker', label: 'QF2 Розетки', slot: 5, position: null, current: 16 },
        { key: 'q3', kind: 'circuit_breaker', label: 'QF3 Кухня', slot: 6, position: null, current: 20 },
        { key: 'l1', kind: 'light_fixture', label: 'Светильник кухни', slot: null, position: [2, 1], power: 60, current: 6, room: 'studio' },
        { key: 'l2', kind: 'light_fixture', label: 'Светильник санузла', slot: null, position: [7, 2], power: 40, current: 6, room: 'wet' },
        { key: 's1', kind: 'socket', label: 'Розетка общая', slot: null, position: [4, 3], power: 400, current: 16, room: 'studio' },
        { key: 's2', kind: 'socket', label: 'Розетка санузла', slot: null, position: [7.5, 1], power: 300, current: 16, room: 'wet' },
        { key: 'oven', kind: 'appliance', label: 'Электроплита', slot: null, position: [5.5, 0.5], power: 3500, current: 20, crossSection: 4, room: 'studio' },
    ],
    edges: [
        { from: 'input', to: 'panel', crossSection: 10 },
        { from: 'panel', to: 'rcd' },
        { from: 'rcd', to: 'q2' },
        { from: 'panel', to: 'q1' },
        { from: 'panel', to: 'q3' },
        { from: 'q1', to: 'l1', crossSection: 1.5 },
        { from: 'q1', to: 'l2', crossSection: 1.5 },
        { from: 'q2', to: 's1' },
        { from: 'q2', to: 's2' },
        { from: 'q3', to: 'oven', crossSection: 4 },
    ],
};

/** Трёхкомнатная квартира 400 В: мастер-выключатель, мокрые зоны, отдельная линия духовки. */
const APARTMENT_PARTS: DemoGraphParts = {
    name: '3-к квартира 400 В',
    prefix: '20000000-0000',
    scale: 0.01,
    rooms: [
        { key: 'living', name: 'Гостиная', type: 'living', polygon: [[0, 0], [5, 0], [5, 4], [0, 4]] },
        { key: 'kitchen', name: 'Кухня', type: 'kitchen', polygon: [[5, 0], [9, 0], [9, 4], [5, 4]] },
        { key: 'bedroom', name: 'Спальня', type: 'living', polygon: [[0, 4], [4, 4], [4, 8], [0, 8]] },
        { key: 'bath', name: 'Ванная', type: 'wet', polygon: [[4, 4], [6, 4], [6, 6], [4, 6]] },
        { key: 'wc', name: 'Туалет', type: 'wet', polygon: [[6, 4], [7, 4], [7, 6], [6, 6]] },
    ],
    walls: [
        [[0, 0], [9, 0], [9, 8], [0, 8], [0, 0]],
        [[5, 0], [5, 4]],
        [[0, 4], [7, 4]],
    ],
    nodes: [
        { key: 'input', kind: 'input_source', label: 'Ввод 400 В', slot: 1, position: null, current: 63 },
        { key: 'master', kind: 'circuit_breaker', label: 'QF0 Мастер-выключатель', slot: 2, position: null, current: 63 },
        { key: 'panel', kind: 'panel', label: 'Щит НКУ', slot: 3, position: [0.3, 3], current: 63 },
        { key: 'rcdWet', kind: 'rcd', label: 'УЗО мокрых зон', slot: 4, position: null, current: 25 },
        { key: 'q1', kind: 'circuit_breaker', label: 'QF1 Освещение', slot: 5, position: null, current: 10 },
        { key: 'q2', kind: 'circuit_breaker', label: 'QF2 Розетки', slot: 6, position: null, current: 16 },
        { key: 'q3', kind: 'circuit_breaker', label: 'QF3 Духовой шкаф', slot: 7, position: null, current: 25 },
        { key: 'l1', kind: 'light_fixture', label: 'Свет гостиной', slot: null, position: [2, 2], power: 120, current: 6, room: 'living' },
        { key: 'l2', kind: 'light_fixture', label: 'Свет кухни', slot: null, position: [7, 2], power: 90, current: 6, room: 'kitchen' },
        { key: 'l3', kind: 'light_fixture', label: 'Свет спальни', slot: null, position: [2, 6], power: 80, current: 6, room: 'bedroom' },
        { key: 's1', kind: 'socket', label: 'Розетка гостиной', slot: null, position: [3, 3], power: 500, current: 16, room: 'living' },
        { key: 's2', kind: 'socket', label: 'Розетка кухни', slot: null, position: [8, 3], power: 800, current: 16, room: 'kitchen' },
        { key: 's3', kind: 'socket', label: 'Розетка ванной', slot: null, position: [5, 5], power: 300, current: 16, room: 'bath' },
        { key: 'oven', kind: 'appliance', label: 'Духовой шкаф', slot: null, position: [8.5, 1], power: 3500, current: 25, crossSection: 4, room: 'kitchen' },
    ],
    edges: [
        { from: 'input', to: 'panel', crossSection: 16 },
        { from: 'panel', to: 'master', crossSection: 16 },
        { from: 'master', to: 'rcdWet' },
        { from: 'master', to: 'q1' },
        { from: 'master', to: 'q2' },
        { from: 'master', to: 'q3', crossSection: 4 },
        { from: 'rcdWet', to: 's3' },
        { from: 'q1', to: 'l1', crossSection: 1.5 },
        { from: 'q1', to: 'l2', crossSection: 1.5 },
        { from: 'q1', to: 'l3', crossSection: 1.5 },
        { from: 'q2', to: 's1' },
        { from: 'q2', to: 's2' },
        { from: 'q3', to: 'oven', crossSection: 4 },
    ],
};

/** Дом ИЖС с баней: отдельная линия длиной 80 м и резервный контур отопления. */
const HOUSE_PARTS: DemoGraphParts = {
    name: 'Дом ИЖС с баней 80 м',
    prefix: '30000000-0000',
    scale: 0.01,
    rooms: [
        { key: 'house', name: 'Дом', type: 'living', polygon: [[0, 0], [10, 0], [10, 8], [0, 8]] },
        { key: 'kitchen', name: 'Кухня', type: 'kitchen', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] },
        { key: 'bath', name: 'Баня', type: 'wet', polygon: [[20, 0], [26, 0], [26, 5], [20, 5]] },
        { key: 'steam', name: 'Парилка', type: 'wet', polygon: [[20, 0], [23, 0], [23, 5], [20, 5]] },
    ],
    walls: [
        [[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]],
        [[20, 0], [26, 0], [26, 5], [20, 5], [20, 0]],
    ],
    nodes: [
        { key: 'input', kind: 'input_source', label: 'ВРУ 0,4 кВ', slot: 1, position: null, current: 100 },
        { key: 'panel', kind: 'panel', label: 'ВРУЩ-1', slot: 2, position: [0.3, 6], current: 100 },
        { key: 'q0', kind: 'circuit_breaker', label: 'QF0 Вводный', slot: 3, position: null, current: 100 },
        { key: 'q1', kind: 'circuit_breaker', label: 'QF1 Дом', slot: 4, position: null, current: 40 },
        { key: 'q2', kind: 'circuit_breaker', label: 'QF2 Баня 80 м', slot: 5, position: null, current: 32 },
        { key: 'rcd', kind: 'rcbo', label: 'QD1 АВДТ баня', slot: 6, position: null, current: 32 },
        { key: 'l1', kind: 'light_fixture', label: 'Свет дома', slot: null, position: [6, 4], power: 180, current: 10, room: 'house' },
        { key: 's1', kind: 'socket', label: 'Розетка дома', slot: null, position: [8, 2], power: 800, current: 16, room: 'house' },
        { key: 's2', kind: 'socket', label: 'Розетка кухни', slot: null, position: [2, 2], power: 1000, current: 16, room: 'kitchen' },
        { key: 'box', kind: 'panel', label: 'Щит бани', slot: null, position: [25, 2], current: 32, room: 'bath' },
        { key: 'heater', kind: 'appliance', label: 'Электокамин', slot: null, position: [21, 2], power: 6000, current: 32, crossSection: 6, room: 'steam' },
        { key: 'l2', kind: 'light_fixture', label: 'Свет бани', slot: null, position: [24, 4], power: 100, current: 10, room: 'bath' },
    ],
    edges: [
        { from: 'input', to: 'panel', crossSection: 25 },
        { from: 'panel', to: 'q0', crossSection: 25 },
        { from: 'q0', to: 'q1', crossSection: 10 },
        { from: 'q0', to: 'q2', crossSection: 10 },
        { from: 'q2', to: 'rcd', crossSection: 6 },
        { from: 'q1', to: 'l1', crossSection: 1.5 },
        { from: 'q1', to: 's1' },
        { from: 'q1', to: 's2' },
        { from: 'rcd', to: 'box', crossSection: 6, waypoints: [[25, 6], [25, 2]] },
        { from: 'box', to: 'heater', crossSection: 6 },
        { from: 'box', to: 'l2', crossSection: 1.5 },
    ],
};

/** Кейсы золотого датасета в порядке отображения в меню. */
export const DEMO_PROJECTS: readonly DemoProjectDefinition[] = [
    {
        id: 'studio-230v',
        nameKey: 'demo.studio.name',
        descriptionKey: 'demo.studio.description',
        createGraph: () => buildGraph(STUDIO_PARTS),
    },
    {
        id: 'apartment-3room-400v',
        nameKey: 'demo.apartment400.name',
        descriptionKey: 'demo.apartment400.description',
        createGraph: () => buildGraph(APARTMENT_PARTS),
    },
    {
        id: 'house-bath-80m',
        nameKey: 'demo.houseBath.name',
        descriptionKey: 'demo.houseBath.description',
        createGraph: () => buildGraph(HOUSE_PARTS),
    },
];

/**
 * Найти кейс золотого датасета по идентификатору.
 * @param id Идентификатор кейса.
 * @returns Описание кейса.
 * @throws Если кейс с таким идентификатором не существует.
 */
export function getDemoProject(id: DemoProjectId): DemoProjectDefinition {
    const found = DEMO_PROJECTS.find((project) => project.id === id);
    if (found === undefined) {
        throw new Error(`Неизвестный демо-проект: ${id}`);
    }
    return found;
}
