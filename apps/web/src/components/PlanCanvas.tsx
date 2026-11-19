import { Circle, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type { GraphNode, NodeKind } from '@voltwirecraft/shared';
import { useGraphStore } from '../store/graph-store.js';

/** Масштаб отображения: пикселей на метр (перевод единиц — только на слое вида). */
const PIXELS_PER_METER = 60;
const STAGE_WIDTH = 760;
const STAGE_HEIGHT = 420;

const KIND_COLORS: Readonly<Record<NodeKind, string>> = {
  source: '#f59e0b',
  panel: '#ef4444',
  outlet: '#3b82f6',
  switch: '#8b5cf6',
  light: '#eab308',
  junction: '#64748b',
  load: '#10b981',
};

/**
 * Цвет узла по его типу.
 *
 * @param kind — тип узла графа.
 * @returns цвет заливки.
 */
function colorForKind(kind: NodeKind): string {
  return KIND_COLORS[kind];
}

/**
 * Проекция графа проекта на план этажа в Konva.js.
 * Геометрия вычисляется из графа, а не хранится отдельно (RULES § 4.18).
 */
export function PlanCanvas(): React.JSX.Element {
  const graph = useGraphStore((state) => state.graph);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectNode = useGraphStore((state) => state.selectNode);

  return (
    <Stage width={STAGE_WIDTH} height={STAGE_HEIGHT} className="rounded-lg bg-slate-900">
      <Layer>
        <Rect width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="#0f172a" />
        {Array.from({ length: 13 }, (_, index) => (
          <Line
            key={`v-${index}`}
            points={[index * PIXELS_PER_METER, 0, index * PIXELS_PER_METER, STAGE_HEIGHT]}
            stroke="#1e293b"
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: 8 }, (_, index) => (
          <Line
            key={`h-${index}`}
            points={[0, index * PIXELS_PER_METER, STAGE_WIDTH, index * PIXELS_PER_METER]}
            stroke="#1e293b"
            strokeWidth={1}
          />
        ))}
        {graph.edges.map((edge) => {
          const from: GraphNode | undefined = graph.nodes.find((node) => node.id === edge.from);
          const to: GraphNode | undefined = graph.nodes.find((node) => node.id === edge.to);
          if (from === undefined || to === undefined) {
            return null;
          }
          return (
            <Line
              key={edge.id}
              points={[
                from.position.x * PIXELS_PER_METER,
                from.position.y * PIXELS_PER_METER,
                to.position.x * PIXELS_PER_METER,
                to.position.y * PIXELS_PER_METER,
              ]}
              stroke="#38bdf8"
              strokeWidth={2}
            />
          );
        })}
        {graph.nodes.map((node) => {
          const x = node.position.x * PIXELS_PER_METER;
          const y = node.position.y * PIXELS_PER_METER;
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
        {graph.nodes.map((node) => (
          <Text
            key={`label-${node.id}`}
            x={node.position.x * PIXELS_PER_METER + 14}
            y={node.position.y * PIXELS_PER_METER - 8}
            text={node.label}
            fontSize={13}
            fill="#e2e8f0"
          />
        ))}
      </Layer>
    </Stage>
  );
}
