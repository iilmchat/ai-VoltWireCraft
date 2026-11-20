// © 2026 RuChating (iilmchat) · VoltWireCraft v0.6.0
/**
 * Золотой датасет: шесть эталонных проектов, доступных без сети (RULES § 5.4).
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
export type DemoProjectId =
    | 'studio-230v'
    | 'apartment-3room-400v'
    | 'house-bath-80m'
    | 'commercial-office-400v'
    | 'cottages-3phase-15kw'
    | 'apartment-2room-gas'
    | 'twostory-house-vru-shr';

/** Фазность ввода шаблона. */
export type DemoSupply = '230' | '400';

/** Описание эталонного проекта. */
export interface DemoProjectDefinition {
    /** Стабильный идентификатор кейса. */
    id: DemoProjectId;
    /** Ключ названия в i18n. */
    nameKey: TranslationKey;
    /** Ключ краткого описания в i18n. */
    descriptionKey: TranslationKey;
    /** Фазность ввода: 230 В (1P) или 400 В (3P). */
    supply: DemoSupply;
    /** Расчётная установленная мощность, кВт. */
    powerKw: number;
    /** Число групповых линий в щите. */
    groups: number;
    /** Необязательный бейдж карточки (например, число щитов). */
    badgeKey?: TranslationKey;
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
    /** Роль узла-щита в иерархии. */
    role?: 'main_vru' | 'sub_shr' | 'lighting_sho';
    /** Локальный ключ родительского щита. */
    parent?: string;
    /** Отключающая способность, kA. */
    breakingCapacityKa?: number;
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
    /** Признак питающей магистрали между щитами. */
    feeder?: boolean;
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
        ...(node.role !== undefined ? { panelRole: node.role } : {}),
        ...(node.parent !== undefined && nodeIds.has(node.parent)
            ? { parentPanelId: nodeIds.get(node.parent) }
            : {}),
        specs: {
            ratedPower: node.power ?? 0,
            ratedCurrent: node.current ?? 16,
            crossSection: node.crossSection ?? 2.5,
            mountingHeight: node.kind === 'socket' ? 0.3 : node.kind === 'light_fixture' ? 2.5 : 1.5,
            ...(node.breakingCapacityKa !== undefined
                ? { breakingCapacityKa: node.breakingCapacityKa }
                : {}),
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
            edgeType: edge.feeder ? 'feeder_line' : CABLE_LINE_EDGE_TYPE,
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

/** Коммерческий офис 400 В: трёхфазный ввод, мастер-выключатель и шесть групповых линий. */
const OFFICE_PARTS: DemoGraphParts = {
    name: 'Офис 400 В',
    prefix: '40000000-0000',
    scale: 0.01,
    rooms: [
        { key: 'openSpace', name: 'Open space', type: 'living', polygon: [[0, 0], [12, 0], [12, 7], [0, 7]] },
        { key: 'meeting', name: 'Переговорная', type: 'living', polygon: [[12, 0], [16, 0], [16, 4], [12, 4]] },
        { key: 'kitchen', name: 'Кухня', type: 'kitchen', polygon: [[12, 4], [16, 4], [16, 7], [12, 7]] },
        { key: 'utility', name: 'Серверная', type: 'utility', polygon: [[0, 7], [4, 7], [4, 10], [0, 10]] },
    ],
    walls: [
        [[0, 0], [16, 0], [16, 10], [0, 10], [0, 0]],
        [[12, 0], [12, 7]],
    ],
    nodes: [
        { key: 'input', kind: 'input_source', label: 'Ввод 400 В', slot: 1, position: null, current: 100 },
        { key: 'master', kind: 'circuit_breaker', label: 'QF0 Мастер 3P', slot: 2, position: null, current: 100 },
        { key: 'panel', kind: 'panel', label: 'Щит НКУ', slot: 3, position: [0.3, 5], current: 100 },
        { key: 'q1', kind: 'circuit_breaker', label: 'QF1 Освещение', slot: 4, position: null, current: 16 },
        { key: 'q2', kind: 'circuit_breaker', label: 'QF2 Розетки open space', slot: 5, position: null, current: 32 },
        { key: 'q3', kind: 'circuit_breaker', label: 'QF3 Переговорная', slot: 6, position: null, current: 16 },
        { key: 'q4', kind: 'rcd', label: 'УЗО кухни', slot: 7, position: null, current: 25 },
        { key: 'q5', kind: 'circuit_breaker', label: 'QF5 Серверная', slot: 8, position: null, current: 32 },
        { key: 'q6', kind: 'circuit_breaker', label: 'QF6 Кондиционеры', slot: 9, position: null, current: 25 },
        { key: 'l1', kind: 'light_fixture', label: 'Свет open space', slot: null, position: [6, 3], power: 900, current: 16, room: 'openSpace' },
        { key: 'l2', kind: 'light_fixture', label: 'Свет переговорной', slot: null, position: [14, 2], power: 200, current: 10, room: 'meeting' },
        { key: 's1', kind: 'socket', label: 'Розетки рабочие', slot: null, position: [8, 5], power: 4000, current: 32, room: 'openSpace' },
        { key: 's2', kind: 'socket', label: 'Розетка кухни', slot: null, position: [14, 5], power: 2000, current: 25, room: 'kitchen' },
        { key: 'server', kind: 'appliance', label: 'Серверный шкаф', slot: null, position: [2, 8], power: 5000, current: 32, crossSection: 6, room: 'utility' },
        { key: 'hvac', kind: 'appliance', label: 'Кондиционеры', slot: null, position: [10, 1], power: 4500, current: 25, crossSection: 4, room: 'openSpace' },
    ],
    edges: [
        { from: 'input', to: 'panel', crossSection: 25 },
        { from: 'panel', to: 'master', crossSection: 25 },
        { from: 'master', to: 'q1' },
        { from: 'master', to: 'q2' },
        { from: 'master', to: 'q3' },
        { from: 'master', to: 'q4' },
        { from: 'master', to: 'q5', crossSection: 6 },
        { from: 'master', to: 'q6', crossSection: 4 },
        { from: 'q1', to: 'l1' },
        { from: 'q1', to: 'l2' },
        { from: 'q2', to: 's1' },
        { from: 'q3', to: 's2' },
        { from: 'q4', to: 's2' },
        { from: 'q5', to: 'server', crossSection: 6 },
        { from: 'q6', to: 'hvac', crossSection: 4 },
    ],
};

/** Два коттеджа с общей трёхфазной линией 15 кВт. */
const COTTAGES_PARTS: DemoGraphParts = {
    name: 'Коттеджи 3ф 15 кВт',
    prefix: '50000000-0000',
    scale: 0.01,
    rooms: [
        { key: 'houseA', name: 'Коттедж А', type: 'living', polygon: [[0, 0], [9, 0], [9, 7], [0, 7]] },
        { key: 'houseB', name: 'Коттедж Б', type: 'living', polygon: [[18, 0], [27, 0], [27, 7], [18, 7]] },
        { key: 'workshop', name: 'Мастерская', type: 'utility', polygon: [[18, 7], [24, 7], [24, 11], [18, 11]] },
    ],
    walls: [
        [[0, 0], [9, 0], [9, 7], [0, 7], [0, 0]],
        [[18, 0], [27, 0], [27, 7], [18, 7], [18, 0]],
    ],
    nodes: [
        { key: 'input', kind: 'input_source', label: 'ВРУ 3ф 400 В', slot: 1, position: null, current: 125 },
        { key: 'panel', kind: 'panel', label: 'ВРУЩ общий', slot: 2, position: [0.3, 4], current: 125 },
        { key: 'q0', kind: 'circuit_breaker', label: 'QF0 Вводный 3P', slot: 3, position: null, current: 125 },
        { key: 'qA', kind: 'circuit_breaker', label: 'QF1 Коттедж А', slot: 4, position: null, current: 63 },
        { key: 'qB', kind: 'circuit_breaker', label: 'QF2 Коттедж Б', slot: 5, position: null, current: 63 },
        { key: 'qW', kind: 'rcbo', label: 'QD3 Мастерская', slot: 6, position: null, current: 40 },
        { key: 'lA', kind: 'light_fixture', label: 'Свет коттеджа А', slot: null, position: [4, 3], power: 400, current: 16, room: 'houseA' },
        { key: 'sA', kind: 'socket', label: 'Розетки коттеджа А', slot: null, position: [7, 5], power: 4000, current: 32, room: 'houseA' },
        { key: 'lB', kind: 'light_fixture', label: 'Свет коттеджа Б', slot: null, position: [22, 3], power: 400, current: 16, room: 'houseB' },
        { key: 'sB', kind: 'socket', label: 'Розетки коттеджа Б', slot: null, position: [25, 5], power: 4000, current: 32, room: 'houseB' },
        { key: 'tool', kind: 'appliance', label: 'Сварочный аппарат', slot: null, position: [21, 9], power: 5500, current: 32, crossSection: 6, room: 'workshop' },
        { key: 'pump', kind: 'appliance', label: 'Насосная станция', slot: null, position: [19, 8], power: 1500, current: 16, room: 'workshop' },
    ],
    edges: [
        { from: 'input', to: 'panel', crossSection: 35 },
        { from: 'panel', to: 'q0', crossSection: 35 },
        { from: 'q0', to: 'qA', crossSection: 16 },
        { from: 'q0', to: 'qB', crossSection: 16 },
        { from: 'q0', to: 'qW', crossSection: 10 },
        { from: 'qA', to: 'lA' },
        { from: 'qA', to: 'sA' },
        { from: 'qB', to: 'lB' },
        { from: 'qB', to: 'sB' },
        { from: 'qW', to: 'tool', crossSection: 6, waypoints: [[19, 12], [21, 9]] },
        { from: 'qW', to: 'pump', crossSection: 2.5 },
    ],
};

/** Двухкомнатная квартира с газовой колонкой: однофазный ввод 230 В. */
const GAS_APARTMENT_PARTS: DemoGraphParts = {
    name: '2-к квартира (газ)',
    prefix: '60000000-0000',
    scale: 0.01,
    rooms: [
        { key: 'living', name: 'Гостиная', type: 'living', polygon: [[0, 0], [5, 0], [5, 4], [0, 4]] },
        { key: 'bedroom', name: 'Спальня', type: 'living', polygon: [[0, 4], [4, 4], [4, 8], [0, 8]] },
        { key: 'kitchen', name: 'Кухня с газовой колонкой', type: 'kitchen', polygon: [[5, 0], [8, 0], [8, 4], [5, 4]] },
        { key: 'bath', name: 'Ванная', type: 'wet', polygon: [[4, 4], [6, 4], [6, 6], [4, 6]] },
    ],
    walls: [
        [[0, 0], [8, 0], [8, 8], [0, 8], [0, 0]],
        [[5, 0], [5, 4]],
        [[0, 4], [6, 4]],
    ],
    nodes: [
        { key: 'input', kind: 'input_source', label: 'Ввод 230 В', slot: 1, position: null, current: 40 },
        { key: 'panel', kind: 'panel', label: 'Щит НКУ', slot: 2, position: [0.3, 3], current: 40 },
        { key: 'q1', kind: 'circuit_breaker', label: 'QF1 Освещение', slot: 3, position: null, current: 10 },
        { key: 'q2', kind: 'circuit_breaker', label: 'QF2 Розетки', slot: 4, position: null, current: 16 },
        { key: 'q3', kind: 'rcd', label: 'УЗО кухни и ванной', slot: 5, position: null, current: 25 },
        { key: 'l1', kind: 'light_fixture', label: 'Свет гостиной', slot: null, position: [2, 2], power: 100, current: 6, room: 'living' },
        { key: 'l2', kind: 'light_fixture', label: 'Свет спальни', slot: null, position: [2, 6], power: 80, current: 6, room: 'bedroom' },
        { key: 's1', kind: 'socket', label: 'Розетка гостиной', slot: null, position: [3, 3], power: 600, current: 16, room: 'living' },
        { key: 's2', kind: 'socket', label: 'Розетка кухни', slot: null, position: [7, 2], power: 1000, current: 16, room: 'kitchen' },
        { key: 'boiler', kind: 'appliance', label: 'Газовая колонка (поджог)', slot: null, position: [7.5, 3], power: 200, current: 6, room: 'kitchen' },
        { key: 'washer', kind: 'appliance', label: 'Стиральная машина', slot: null, position: [5, 5], power: 2200, current: 16, room: 'bath' },
    ],
    edges: [
        { from: 'input', to: 'panel', crossSection: 10 },
        { from: 'panel', to: 'q1' },
        { from: 'panel', to: 'q2' },
        { from: 'panel', to: 'q3' },
        { from: 'q1', to: 'l1', crossSection: 1.5 },
        { from: 'q1', to: 'l2', crossSection: 1.5 },
        { from: 'q2', to: 's1' },
        { from: 'q3', to: 's2' },
        { from: 'q3', to: 'boiler', crossSection: 1.5 },
        { from: 'q3', to: 'washer' },
    ],
};

/** Двухэтажный дом с иерархией ВРУ → ЩР-1 / ЩР-2 и магистральными линиями. */
const TWO_STORY_PARTS: DemoGraphParts = {
    name: 'Дом 2 этажа: ВРУ + ЩР-2',
    prefix: '70000000-0000',
    scale: 0.01,
    rooms: [
        { key: 'floor1', name: 'Первый этаж', type: 'living', polygon: [[0, 0], [10, 0], [10, 8], [0, 8]] },
        { key: 'floor2', name: 'Второй этаж', type: 'living', polygon: [[0, 8], [10, 8], [10, 16], [0, 16]] },
        { key: 'basement', name: 'Подсобное помещение', type: 'utility', polygon: [[10, 0], [14, 0], [14, 5], [10, 5]] },
    ],
    walls: [
        [[0, 0], [10, 0], [10, 16], [0, 16], [0, 0]],
        [[0, 8], [10, 8]],
    ],
    nodes: [
        { key: 'input', kind: 'input_source', label: 'Ввод 400 В', slot: 1, position: null, current: 125, breakingCapacityKa: 25 },
        { key: 'vru', kind: 'panel', label: 'ВРУ', slot: 2, position: [0.3, 4], current: 125, role: 'main_vru' },
        { key: 'qMain', kind: 'circuit_breaker', label: 'QF0 ВРУ 3P', slot: 3, position: null, current: 125, breakingCapacityKa: 25 },
        { key: 'shr1', kind: 'panel', label: 'ЩР-1', slot: 4, position: [5, 3], current: 63, role: 'sub_shr', parent: 'vru' },
        { key: 'shr2', kind: 'panel', label: 'ЩР-2', slot: 5, position: [5, 12], current: 63, role: 'sub_shr', parent: 'vru' },
        { key: 'q1', kind: 'circuit_breaker', label: 'QF1 ЩР-1 Освещение', slot: 6, position: null, current: 16, breakingCapacityKa: 10, parent: 'shr1' },
        { key: 'q2', kind: 'rcd', label: 'УЗО ЩР-1 Розетки', slot: 7, position: null, current: 32, breakingCapacityKa: 10, parent: 'shr1' },
        { key: 'q3', kind: 'circuit_breaker', label: 'QF3 ЩР-2 Освещение', slot: 8, position: null, current: 16, breakingCapacityKa: 10, parent: 'shr2' },
        { key: 'q4', kind: 'rcbo', label: 'QD4 ЩР-2 Розетки', slot: 9, position: null, current: 32, breakingCapacityKa: 10, parent: 'shr2' },
        { key: 'l1', kind: 'light_fixture', label: 'Свет 1 этажа', slot: null, position: [3, 2], power: 300, current: 10, room: 'floor1' },
        { key: 's1', kind: 'socket', label: 'Розетки 1 этажа', slot: null, position: [7, 5], power: 2500, current: 16, room: 'floor1' },
        { key: 'l2', kind: 'light_fixture', label: 'Свет 2 этажа', slot: null, position: [3, 11], power: 300, current: 10, room: 'floor2' },
        { key: 's2', kind: 'socket', label: 'Розетки 2 этажа', slot: null, position: [7, 14], power: 2500, current: 16, room: 'floor2' },
        { key: 'boiler', kind: 'appliance', label: 'Котёл', slot: null, position: [12, 2], power: 6000, current: 32, crossSection: 6, room: 'basement' },
    ],
    edges: [
        { from: 'input', to: 'vru', crossSection: 25 },
        { from: 'vru', to: 'qMain', crossSection: 25 },
        { from: 'qMain', to: 'shr1', crossSection: 16, feeder: true, waypoints: [[2, 4], [5, 3]] },
        { from: 'qMain', to: 'shr2', crossSection: 16, feeder: true, waypoints: [[2, 4], [5, 12]] },
        { from: 'shr1', to: 'q1' },
        { from: 'shr1', to: 'q2' },
        { from: 'shr2', to: 'q3' },
        { from: 'shr2', to: 'q4' },
        { from: 'q1', to: 'l1', crossSection: 1.5 },
        { from: 'q2', to: 's1' },
        { from: 'q3', to: 'l2', crossSection: 1.5 },
        { from: 'q4', to: 's2' },
        { from: 'shr1', to: 'boiler', crossSection: 6, waypoints: [[10, 3], [12, 2]] },
    ],
};

/** Кейсы золотого датасета в порядке отображения в меню. */
export const DEMO_PROJECTS: readonly DemoProjectDefinition[] = [
    {
        id: 'studio-230v',
        nameKey: 'demo.studio.name',
        descriptionKey: 'demo.studio.description',
        supply: '230',
        powerKw: 5,
        groups: 3,
        createGraph: () => buildGraph(STUDIO_PARTS),
    },
    {
        id: 'apartment-3room-400v',
        nameKey: 'demo.apartment400.name',
        descriptionKey: 'demo.apartment400.description',
        supply: '400',
        powerKw: 6.3,
        groups: 3,
        createGraph: () => buildGraph(APARTMENT_PARTS),
    },
    {
        id: 'house-bath-80m',
        nameKey: 'demo.houseBath.name',
        descriptionKey: 'demo.houseBath.description',
        supply: '400',
        powerKw: 9.7,
        groups: 3,
        createGraph: () => buildGraph(HOUSE_PARTS),
    },
    {
        id: 'commercial-office-400v',
        nameKey: 'demo.office.name',
        descriptionKey: 'demo.office.description',
        supply: '400',
        powerKw: 15,
        groups: 6,
        createGraph: () => buildGraph(OFFICE_PARTS),
    },
    {
        id: 'cottages-3phase-15kw',
        nameKey: 'demo.cottages.name',
        descriptionKey: 'demo.cottages.description',
        supply: '400',
        powerKw: 15,
        groups: 5,
        createGraph: () => buildGraph(COTTAGES_PARTS),
    },
    {
        id: 'apartment-2room-gas',
        nameKey: 'demo.gas.name',
        descriptionKey: 'demo.gas.description',
        supply: '230',
        powerKw: 4.5,
        groups: 3,
        createGraph: () => buildGraph(GAS_APARTMENT_PARTS),
    },
    {
        id: 'twostory-house-vru-shr',
        nameKey: 'demo.twoStory.name',
        descriptionKey: 'demo.twoStory.description',
        supply: '400',
        powerKw: 15,
        groups: 4,
        badgeKey: 'template.twoPanels' as TranslationKey,
        createGraph: () => buildGraph(TWO_STORY_PARTS),
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

/**
 * Найти шаблон по детерминированному идентификатору графа.
 * @param graphId Идентификатор текущего `ProjectGraph`.
 * @returns Шаблон или `undefined`, если граф загружен из файла/сервера.
 */
export function getDemoByGraphId(graphId: string): DemoProjectDefinition | undefined {
    return demoByGraphId().get(graphId);
}

/** Кэш соответствия идентификатора графа шаблону (создаётся один раз). */
let cachedDemoByGraphId: ReadonlyMap<string, DemoProjectDefinition> | null = null;

/**
 * Получить кэш соответствия «идентификатор графа → шаблон».
 * @returns Кэш, вычисленный при первом обращении.
 */
function demoByGraphId(): ReadonlyMap<string, DemoProjectDefinition> {
    if (cachedDemoByGraphId === null) {
        cachedDemoByGraphId = new Map(DEMO_PROJECTS.map((project) => [project.createGraph().id, project]));
    }
    return cachedDemoByGraphId;
}
