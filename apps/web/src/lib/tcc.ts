// © 2026 RuChating (iilmchat) · VoltWireCraft v0.6.0
/**
 * Детерминированный локальный предпросмотр время-токовых характеристик (ВТХ)
 * и селективности аппаратов защиты (RULES § 5.1).
 *
 * Модуль НЕ использует ИИ и случайность: все числа выводятся из кусочно-
 * заданной аппроксимации ГОСТ Р 50345 (IEC 60898-1). Основной путь расчёта —
 * серверный API; этот модуль включается только при отсутствии серверного
 * проекта или при ошибке запроса, и честно помечается как «предпросмотр».
 */
import type {
    GraphNode,
    ProjectGraph,
    TccCurve,
    TccSelectivityRequest,
    TccSelectivityResponse,
} from '@voltwirecraft/shared/graph.schema.js';
import { useCalculationStore } from '../store/calculationStore.js';

/** Представление аппарата ВТХ, совместимое с каноническим контрактом запроса. */
export type TccDeviceView = TccSelectivityRequest['devices'][number];

/** Представление пары ВТХ, совместимое с каноническим контрактом ответа. */
export type TccPairView = TccSelectivityResponse['pairs'][number];

/** Выдержка селективности по умолчанию, с. */
const DEFAULT_DELTA_S = 0.1;
/** Время мгновенного срабатывания выше верхней границы магнитного диапазона, с. */
const INSTANT_TIME_S = 0.01;
/** Конечная «практически бесконечная» выдержка для токов ниже 1×In, с. */
const NON_TRIP_TIME_S = 1_000_000;
/** Тепловая зона: не срабатывание за 1 ч при 1,13×In. */
const THERMAL_113_S = 3600;
/** Тепловая зона: срабатывание не позднее 1 ч при 1,45×In. */
const THERMAL_145_S = 1800;
/** Тепловая зона: срабатывание за 1..60 с при 2,55×In (In ≤ 32 A). */
const THERMAL_255_S = 30;
/** Переход к магнитной зоне. */
const MAGNETIC_ENTRY_S = 0.1;
/** Число интервалов грубого поиска предела селективности. */
const LIMIT_SCAN_STEPS = 2048;
/** Число итераций уточнения предела селективности. */
const LIMIT_REFINE_STEPS = 60;
/** Число точек кривой по умолчанию. */
const DEFAULT_SAMPLES = 32;
/** Нормативные ссылки предпросмотра. */
const REFERENCES: readonly string[] = ['ГОСТ Р 50345 (IEC 60898-1)', 'TCC_SELECTIVITY_V06'];

/** Типы узлов графа, являющиеся аппаратами защиты. */
const PROTECTIVE_KINDS: readonly GraphNode['kind'][] = ['circuit_breaker', 'rcd', 'rcbo'];

/**
 * Проверить конечное положительное число.
 * @param value Проверяемое значение.
 * @returns true, если значение конечно и больше нуля.
 */
function isPositiveFinite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Прочитать характеристику расцепителя из спецификации узла.
 * Поле может отсутствовать в старых проектах, поэтому чтение защищено.
 * @param specs Спецификация узла графа.
 * @returns Кривая B/C/D или `null`.
 */
function readTripCurve(specs: GraphNode['specs']): TccCurve | null {
    const raw: unknown = specs;
    if (typeof raw !== 'object' || raw === null || !('tripCurve' in raw)) {
        return null;
    }
    const value: unknown = raw.tripCurve;
    return value === 'B' || value === 'C' || value === 'D' ? value : null;
}

/**
 * Прочитать родительский щит узла (многощитовая иерархия).
 * @param node Узел графа.
 * @returns Идентификатор родителя или `null`.
 */
function readParentPanelId(node: GraphNode): string | null {
    const raw: unknown = node;
    if (typeof raw !== 'object' || raw === null || !('parentPanelId' in raw)) {
        return null;
    }
    const value: unknown = raw.parentPanelId;
    return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Подпись аппарата для предупреждений.
 * @param device Аппарат ВТХ.
 * @returns Подпись узла или его идентификатор.
 */
function deviceLabel(device: TccDeviceView): string {
    const raw: unknown = device;
    if (typeof raw === 'object' && raw !== null && 'label' in raw && typeof raw.label === 'string' && raw.label.length > 0) {
        return raw.label;
    }
    return device.id;
}

/**
 * Проверить, является ли узел аппаратом защиты с заданным номиналом.
 * @param node Узел графа.
 * @returns true для автомата/УЗО/дифавтомата.
 */
function isProtective(node: GraphNode): boolean {
    return PROTECTIVE_KINDS.includes(node.kind) && isPositiveFinite(node.specs.ratedCurrent);
}

/**
 * Границы магнитного диапазона срабатывания (кратные In).
 * @param curve Тип характеристики B/C/D.
 * @returns Нижняя и верхняя границы.
 */
function magneticBounds(curve: TccCurve): readonly [number, number] {
    if (curve === 'B') {
        return [3, 5];
    }
    if (curve === 'D') {
        return [10, 20];
    }
    return [5, 10];
}

/**
 * Округлить значение до трёх знаков после запятой.
 * @param value Число.
 * @returns Округлённое конечное неотрицательное число.
 */
function round3(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const rounded = Math.round(value * 1000) / 1000;
    return rounded > 0 ? rounded : 0;
}

/**
 * Время срабатывания аппарата при заданном токе (монотонная непрерывная ВТХ).
 *
 * Аппроксимация кусочно-логарифмической интерполяцией по опорным точкам
 * ГОСТ Р 50345: 1,13×In ≥ 3600 с, 1,45×In ≤ 3600 с, 2,55×In ∈ [1; 60] с,
 * магнитный диапазон B 3–5 In, C 5–10 In, D 10–20 In, выше — 0,01 с.
 *
 * @param device Аппарат ВТХ.
 * @param currentA Ток, A.
 * @returns Время срабатывания, с (конечное, неотрицательное).
 */
export function tripTime(device: TccDeviceView, currentA: number): number {
    const rated = device.ratedCurrentA;
    if (!isPositiveFinite(currentA) || !isPositiveFinite(rated)) {
        return NON_TRIP_TIME_S;
    }
    const multiplicity = currentA / rated;
    if (!Number.isFinite(multiplicity) || multiplicity <= 0) {
        return NON_TRIP_TIME_S;
    }
    const [magneticLow, magneticHigh] = magneticBounds(device.tripCurve);
    if (multiplicity >= magneticHigh) {
        return INSTANT_TIME_S;
    }

    const anchors: readonly (readonly [number, number])[] = [
        [1, NON_TRIP_TIME_S],
        [1.13, THERMAL_113_S],
        [1.45, THERMAL_145_S],
        [2.55, THERMAL_255_S],
        [magneticLow, MAGNETIC_ENTRY_S],
        [magneticHigh, INSTANT_TIME_S],
    ];

    for (let index = 0; index < anchors.length - 1; index += 1) {
        const from = anchors[index];
        const to = anchors[index + 1];
        if (multiplicity >= from[0] && multiplicity <= to[0]) {
            const ratio = (Math.log(multiplicity) - Math.log(from[0])) / (Math.log(to[0]) - Math.log(from[0]));
            const value = Math.exp(Math.log(from[1]) + ratio * (Math.log(to[1]) - Math.log(from[1])));
            if (!Number.isFinite(value)) {
                return NON_TRIP_TIME_S;
            }
            return Math.min(NON_TRIP_TIME_S, Math.max(INSTANT_TIME_S, value));
        }
    }
    return INSTANT_TIME_S;
}

/**
 * Логарифмически равномерные точки ВТХ для построения SVG-полилинии.
 * @param device Аппарат ВТХ.
 * @param fromA Нижняя граница тока, A; по умолчанию In.
 * @param toA Верхняя граница тока, A; по умолчанию 20×In.
 * @param samples Число отсчётов; по умолчанию 32 (от 2 до 4096).
 * @returns Массив точек `{ i, t }` в порядке возрастания тока.
 */
export function tccCurvePoints(
    device: TccDeviceView,
    fromA?: number,
    toA?: number,
    samples?: number,
): readonly { i: number; t: number }[] {
    const start = isPositiveFinite(fromA) ? fromA : device.ratedCurrentA;
    const end = isPositiveFinite(toA) ? toA : device.ratedCurrentA * 20;
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    const count = Number.isFinite(samples)
        ? Math.max(2, Math.min(4096, Math.floor(samples as number)))
        : DEFAULT_SAMPLES;
    const points: { i: number; t: number }[] = [];
    for (let index = 0; index < count; index += 1) {
        const fraction = index / (count - 1);
        const current = low * Math.pow(high / low, fraction);
        points.push({ i: current, t: tripTime(device, current) });
    }
    return points;
}

/**
 * Найти вышестоящий аппарат защиты по рёбрам графа и цепочке щитов.
 * @param graph Канонический граф проекта.
 * @param target Нижестоящий аппарат.
 * @returns Вышестоящий аппарат или `null`.
 */
function findUpstreamDevice(graph: ProjectGraph, target: GraphNode): GraphNode | null {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const incoming = new Map<string, string[]>();
    for (const edge of graph.edges) {
        const list = incoming.get(edge.to) ?? [];
        list.push(edge.from);
        incoming.set(edge.to, list);
    }

    const visited = new Set<string>([target.id]);
    const queue: string[] = [target.id];
    const panelParent = readParentPanelId(target);
    if (panelParent !== null && byId.has(panelParent)) {
        visited.add(panelParent);
        queue.push(panelParent);
    }

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) {
            continue;
        }
        for (const sourceId of incoming.get(current) ?? []) {
            if (visited.has(sourceId)) {
                continue;
            }
            visited.add(sourceId);
            const source = byId.get(sourceId);
            if (source === undefined) {
                continue;
            }
            if (isProtective(source)) {
                return source;
            }
            queue.push(sourceId);
            const sourcePanel = readParentPanelId(source);
            if (sourcePanel !== null && !visited.has(sourcePanel) && byId.has(sourcePanel)) {
                visited.add(sourcePanel);
                queue.push(sourcePanel);
            }
        }
    }

    const sourceIds = new Set(graph.nodes.filter((node) => node.kind === 'input_source').map((node) => node.id));
    for (const edge of graph.edges) {
        if (!sourceIds.has(edge.from)) {
            continue;
        }
        const fed = byId.get(edge.to);
        if (fed !== undefined && fed.id !== target.id && isProtective(fed)) {
            return fed;
        }
    }

    const others = graph.nodes.filter((node) => node.id !== target.id && isProtective(node));
    return others.find((node) => node.specs.ratedCurrent > target.specs.ratedCurrent) ?? others[0] ?? null;
}

/**
 * Преобразовать узел графа в аппарат ВТХ.
 * @param node Узел графа.
 * @param parentId Идентификатор вышестоящего аппарата или `null`.
 * @returns Аппарат ВТХ канонического контракта.
 */
function toDevice(node: GraphNode, parentId: string | null): TccDeviceView {
    const capacity = node.specs.breakingCapacityKa;
    return {
        id: node.id,
        label: node.label,
        ratedCurrentA: node.specs.ratedCurrent,
        tripCurve: readTripCurve(node.specs) ?? 'C',
        ...(isPositiveFinite(capacity) ? { breakingCapacityKa: capacity } : {}),
        parentId,
    } as TccDeviceView;
}

/**
 * Определить расчётный ток КЗ для запроса.
 * @param passed Значение, переданное вызывающей стороной.
 * @param downstream Нижестоящий аппарат.
 * @param upstream Вышестоящий аппарат или `null`.
 * @returns Конечное положительное значение тока, A.
 */
function resolveShortCircuitCurrent(
    passed: number | undefined,
    downstream: TccDeviceView,
    upstream: TccDeviceView | null,
): number {
    if (isPositiveFinite(passed)) {
        return passed;
    }
    try {
        const stored = useCalculationStore.getState().shortCircuit?.shortCircuitCurrentA;
        if (isPositiveFinite(stored)) {
            return stored;
        }
    } catch {
        // Хранилище может быть недоступно в изолированных сценариях.
    }
    if (isPositiveFinite(downstream.shortCircuitCurrentA)) {
        return downstream.shortCircuitCurrentA;
    }
    if (upstream !== null && isPositiveFinite(upstream.shortCircuitCurrentA)) {
        return upstream.shortCircuitCurrentA;
    }
    const capacity = downstream.breakingCapacityKa;
    if (isPositiveFinite(capacity)) {
        return capacity * 1000;
    }
    return 1000;
}

/**
 * Сформировать канонический запрос расчёта ВТХ из графа проекта.
 *
 * В массиве `devices` первым идёт нижестоящий аппарат (`parentId` указывает
 * на вышестоящий), вторым — вышестоящий. Если в графе только один аппарат,
 * возвращается одноэлементный запрос с `parentId: null`.
 *
 * @param graph Канонический граф проекта.
 * @param deviceId Идентификатор выбранного узла-аппарата.
 * @param shortCircuitCurrentA Ток КЗ, A; по умолчанию из расчёта КЗ/хранилища.
 * @returns Запрос `TccSelectivityRequest`.
 * @throws {Error} Если в графе нет ни одного аппарата защиты.
 */
export function buildTccRequest(
    graph: ProjectGraph,
    deviceId: string,
    shortCircuitCurrentA?: number,
): TccSelectivityRequest {
    const target = graph.nodes.find((node) => node.id === deviceId && isProtective(node))
        ?? graph.nodes.find((node) => isProtective(node));
    if (target === undefined) {
        throw new Error('В графе проекта не найден аппарат защиты для расчёта ВТХ');
    }
    const upstream = findUpstreamDevice(graph, target);
    const downstreamDevice = toDevice(target, upstream?.id ?? null);
    const devices: TccDeviceView[] = upstream === null
        ? [downstreamDevice]
        : [downstreamDevice, toDevice(upstream, null)];
    const isc = resolveShortCircuitCurrent(shortCircuitCurrentA, downstreamDevice, devices[1] ?? null);
    return {
        devices,
        shortCircuitCurrentA: isc,
        selectivityDeltaS: DEFAULT_DELTA_S,
    } as TccSelectivityRequest;
}

/**
 * Найти наибольший ток, при котором выдерживается выдержка селективности.
 * @param downstream Нижестоящий аппарат.
 * @param upstream Вышестоящий аппарат.
 * @param deltaReq Требуемая выдержка, с.
 * @returns Предел селективности, A (округлён до трёх знаков).
 */
function findSelectivityLimit(
    downstream: TccDeviceView,
    upstream: TccDeviceView,
    deltaReq: number,
): number {
    const holds = (current: number): boolean =>
        tripTime(downstream, current) + deltaReq <= tripTime(upstream, current);

    const lowStart = Math.max(0.01, Math.min(downstream.ratedCurrentA, upstream.ratedCurrentA) * 0.5);
    const upperDevice = (device: TccDeviceView): number =>
        magneticBounds(device.tripCurve)[1] * device.ratedCurrentA;
    const highStart = Math.max(
        upperDevice(downstream),
        upperDevice(upstream),
        lowStart * 100,
    );

    let lastTrue = 0;
    let upperBound = highStart;
    let found = false;
    for (let step = 0; step <= LIMIT_SCAN_STEPS; step += 1) {
        const current = lowStart * Math.pow(highStart / lowStart, step / LIMIT_SCAN_STEPS);
        if (holds(current)) {
            lastTrue = current;
            found = true;
        } else if (found && current > lastTrue) {
            upperBound = current;
            break;
        }
    }
    if (!found) {
        return 0;
    }

    let low = lastTrue;
    let high = upperBound;
    for (let step = 0; step < LIMIT_REFINE_STEPS; step += 1) {
        const middle = (low + high) / 2;
        if (holds(middle)) {
            low = middle;
        } else {
            high = middle;
        }
    }
    return round3(low);
}

/**
 * Детерминированный локальный предпросмотр расчёта ВТХ и селективности.
 *
 * Используется только при отсутствии серверного проекта или при ошибке API.
 * Все предупреждения формулируются на русском языке; результат содержит
 * нормативные ссылки на ГОСТ Р 50345 (IEC 60898-1).
 *
 * @param request Канонический запрос `TccSelectivityRequest`.
 * @returns Канонический ответ `TccSelectivityResponse`.
 */
export function computeTccPreview(request: TccSelectivityRequest): TccSelectivityResponse {
    const devices = request.devices;
    const isc = isPositiveFinite(request.shortCircuitCurrentA) ? request.shortCircuitCurrentA : 1000;
    const rawDelta = request.selectivityDeltaS;
    const delta = isPositiveFinite(rawDelta) ? rawDelta : DEFAULT_DELTA_S;
    const warnings: string[] = [
        'Предпросмотр выполнен локальной детерминированной аппроксимацией ГОСТ Р 50345 (IEC 60898-1) и не заменяет расчёт сервера.',
    ];

    let breakingCapacityOk = devices.length > 0;
    for (const device of devices) {
        const capacity = device.breakingCapacityKa;
        const name = deviceLabel(device);
        if (!isPositiveFinite(capacity)) {
            breakingCapacityOk = false;
            warnings.push(`Не указана отключающая способность аппарата ${name}: проверка Icn считается не пройденной.`);
        } else if (capacity * 1000 < isc) {
            breakingCapacityOk = false;
            warnings.push(
                `Отключающая способность аппарата ${name} (${capacity.toFixed(1)} кА) ниже тока КЗ ${isc.toFixed(1)} А.`,
            );
        }
    }

    const limits: number[] = [];
    const pairs: TccPairView[] = [];
    for (const device of devices) {
        const parentId = device.parentId;
        if (typeof parentId !== 'string' || parentId.length === 0 || parentId === device.id) {
            continue;
        }
        const parent = devices.find((candidate) => candidate.id === parentId);
        if (parent === undefined) {
            warnings.push(`Вышестоящий аппарат ${parentId} для ${deviceLabel(device)} не найден в запросе.`);
            continue;
        }
        const limit = findSelectivityLimit(device, parent, delta);
        limits.push(limit);
        pairs.push({
            deviceId: device.id,
            parentId: parent.id,
            ok: limit >= isc,
            selectivityLimitA: limit,
        } as TccPairView);
    }
    if (pairs.length === 0) {
        warnings.push('Не найдена пара аппаратов для проверки селективности.');
    }

    const selectivityLimitA = limits.length > 0 ? round3(Math.min(...limits)) : 0;
    return {
        selectivityLimitA,
        pairs,
        breakingCapacityOk,
        totalVoltageDropPercent: 0,
        warnings,
        references: [...REFERENCES],
    } as TccSelectivityResponse;
}
