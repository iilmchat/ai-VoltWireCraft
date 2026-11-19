// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import type { GraphNode } from '@voltwirecraft/shared/graph.schema.js';
import { Circle, Group, Line, Rect, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { ScreenPoint } from '../lib/geometry.js';

/** Свойства узла ЭУИ на холсте. */
export interface DeviceNodeProps {
    /** Узел канонического графа. */
    node: GraphNode;
    /** Позиция в пикселях подложки. */
    positionPx: ScreenPoint;
    /** Признак выделения. */
    selected: boolean;
    /** Разрешить перетаскивание. */
    draggable: boolean;
    /** Обработчик выбора узла. */
    onSelect: () => void;
    /** Обработчик перемещения (позиция в пикселях подложки). */
    onMove: (point: ScreenPoint) => void;
}

/**
 * Условное графическое обозначение узла графа на плане.
 * @param props Свойства узла.
 * @returns React-элемент группы Konva.
 */
export function DeviceNode({
    node,
    positionPx,
    selected,
    draggable,
    onSelect,
    onMove,
}: DeviceNodeProps) {
    const stroke = selected ? '#38bdf8' : '#0f172a';
    const strokeWidth = selected ? 3 : 1;

    const handleDragEnd = (event: KonvaEventObject<DragEvent>): void => {
        onMove({ x: event.target.x(), y: event.target.y() });
    };

    return (
        <Group
            x={positionPx.x}
            y={positionPx.y}
            draggable={draggable}
            onDragEnd={handleDragEnd}
            onClick={onSelect}
            onTap={onSelect}
        >
            {node.kind === 'panel' && (
                <>
                    <Rect
                        x={-20}
                        y={-14}
                        width={40}
                        height={28}
                        fill="#1e3a8a"
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        cornerRadius={3}
                    />
                    <Text x={-8} y={-6} text="НКУ" fontSize={10} fill="#e0f2fe" />
                </>
            )}
            {node.kind === 'socket' && (
                <>
                    <Circle radius={11} fill="#fef3c7" stroke={stroke} strokeWidth={strokeWidth} />
                    <Line points={[-5, -5, 5, 5]} stroke="#92400e" strokeWidth={2} />
                    <Line points={[-5, 5, 5, -5]} stroke="#92400e" strokeWidth={2} />
                </>
            )}
            {node.kind === 'switch' && (
                <>
                    <Rect
                        x={-9}
                        y={-9}
                        width={18}
                        height={18}
                        fill="#dcfce7"
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        cornerRadius={2}
                    />
                    <Line points={[-5, 3, 5, -3]} stroke="#166534" strokeWidth={2} />
                </>
            )}
            {node.kind === 'light_fixture' && (
                <>
                    <Circle radius={12} fill="#fef9c3" stroke={stroke} strokeWidth={strokeWidth} />
                    <Line points={[-7, 0, 7, 0]} stroke="#a16207" strokeWidth={2} />
                    <Line points={[0, -7, 0, 7]} stroke="#a16207" strokeWidth={2} />
                </>
            )}
            {node.kind === 'appliance' && (
                <>
                    <Rect
                        x={-13}
                        y={-11}
                        width={26}
                        height={22}
                        fill="#ffe4e6"
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        cornerRadius={2}
                    />
                    <Text x={-9} y={-6} text="П" fontSize={11} fill="#9f1239" />
                </>
            )}
            {!['panel', 'socket', 'switch', 'light_fixture', 'appliance'].includes(node.kind) && (
                <Circle radius={10} fill="#cbd5e1" stroke={stroke} strokeWidth={strokeWidth} />
            )}
            <Text
                x={-55}
                y={16}
                width={110}
                align="center"
                text={node.label}
                fontSize={11}
                fill="#e2e8f0"
                listening={false}
            />
        </Group>
    );
}
