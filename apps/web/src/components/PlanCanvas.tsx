// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import type { GraphNode, NodeKind } from '@voltwirecraft/shared/graph.schema.js';
import { Circle, Layer, Line, Rect, Stage } from 'react-konva';
import { useGraphStore } from '../store/graph-store.js';

/** Масштаб отображения: пикселей на метр. */
const PIXELS_PER_METER = 60;
/** Ширина холста демо-проекции. */
const STAGE_WIDTH = 760;
/** Высота холста демо-проекции. */
const STAGE_HEIGHT = 420;

/** Цвета узлов по УГО. */
const KIND_COLORS: Readonly<Record<NodeKind, string>> = {
    input_source: '#f59e0b',
    panel: '#ef4444',
    circuit_breaker: '#fb923c',
    rcd: '#f472b6',
    rcbo: '#ec4899',
    relay_voltage: '#a78bfa',
    contactor: '#8b5cf6',
    socket: '#3b82f6',
    light_fixture: '#eab308',
    switch: '#22c55e',
    appliance: '#10b981',
};

/**
 * Цвет узла по его типу УГО.
 * @param kind Тип узла графа.
 * @returns Цвет заливки.
 */
function colorForKind(kind: NodeKind): string {
    return KIND_COLORS[kind];
}

/**
 * Демонстрационная проекция графа на план этажа в Konva.js.
 * @returns React-элемент холста.
 */
export function PlanCanvas() {
    const graph = useGraphStore((state) => state.graph);
    const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
    const selectNode = useGraphStore((state) => state.selectNode);

    return (
        <Stage width={STAGE_WIDTH} height={STAGE_HEIGHT} className="rounded-lg bg-slate-900">
            <Layer>
                <Rect width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="#0f172a" />
                {graph.edges.map((edge) => {
                    const from: GraphNode | undefined = graph.nodes.find((node) => node.id === edge.from);
                    const to: GraphNode | undefined = graph.nodes.find((node) => node.id === edge.to);
                    if (from === undefined || to === undefined || from.planPosition === null || to.planPosition === null) {
                        return null;
                    }
                    return (
                        <Line
                            key={edge.id}
                            points={[
                                from.planPosition.x * PIXELS_PER_METER,
                                from.planPosition.y * PIXELS_PER_METER,
                                to.planPosition.x * PIXELS_PER_METER,
                                to.planPosition.y * PIXELS_PER_METER,
                            ]}
                            stroke="#38bdf8"
                            strokeWidth={2}
                        />
                    );
                })}
                {graph.nodes.map((node) => {
                    if (node.planPosition === null) {
                        return null;
                    }
                    const x = node.planPosition.x * PIXELS_PER_METER;
                    const y = node.planPosition.y * PIXELS_PER_METER;
                    const selected = node.id === selectedNodeId;
                    return (
                        <Circle
                            key={node.id}
                            x={x}
                            y={y}
                            radius={selected ? 14 : 11}
                            fill={colorForKind(node.kind)}
                            stroke={selected ? '#ffffff' : '#0f172a'}
                            strokeWidth={selected ? 3 : 1}
                            onClick={() => selectNode(node.id)}
                        />
                    );
                })}
            </Layer>
        </Stage>
    );
}
