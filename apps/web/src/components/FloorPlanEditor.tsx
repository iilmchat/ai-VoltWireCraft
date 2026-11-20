// © 2026 RuChating (iilmchat) · VoltWireCraft v0.7.0
import type { GraphNode, RoomZone } from '@voltwirecraft/shared/graph.schema.js';
import { Circle, Image as KonvaImage, Layer, Line, Stage, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import { restoreBackgroundImageAsync } from '../lib/background.js';
import {
    distance,
    flattenPoints,
    metersToPx,
    polygonCentroid,
    screenToWorld,
    zoomAtPoint,
} from '../lib/geometry.js';
import type { ScreenPoint } from '../lib/geometry.js';
import { getCanvasPalette, useResolvedTheme } from '../lib/theme.js';
import { useEditorStore } from '../store/editorStore.js';
import type { UiDeviceKind } from '../store/editorStore.js';
import { CableRouteTool } from './tools/CableRouteTool.js';
import { UI_DEVICE_KINDS } from './tools/DevicePlacementTool.js';
import { DeviceNode } from './DeviceNode.js';
import { RoomZoneTool } from './tools/RoomZoneTool.js';
import { ScaleCalibratorTool } from './tools/ScaleCalibratorTool.js';

/**
 * Проверить, что строка — поддерживаемый тип ЭУИ палитры.
 * @param value Проверяемое значение.
 * @returns true для типа из DEVICE_KINDS.
 */
function isUiDeviceKind(value: string): value is UiDeviceKind {
    return UI_DEVICE_KINDS.some((kind) => kind === value);
}

/**
 * Проверить, что событие клавиатуры пришло из поля ввода.
 * @param target Цель события.
 * @returns true для input/select/textarea.
 */
function isEditingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    return ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

/**
 * Интерактивный холст редактора плана.
 * Слои: подложка → помещения → ЭУИ → трассы → инструменты (RULES § 5.2).
 * @returns React-элемент редактора.
 */
export function FloorPlanEditor() {
    const { t } = useI18n();
    // Палитра холста следует выбранной теме (Konva не понимает CSS-переменные).
    const palette = getCanvasPalette(useResolvedTheme());
    const containerRef = useRef<HTMLDivElement | null>(null);
    const panRef = useRef<{ x: number; y: number } | null>(null);
    const drawingRef = useRef(false);
    const [size, setSize] = useState({ width: 960, height: 640 });
    const [cursor, setCursor] = useState<ScreenPoint | null>(null);
    const [spacePressed, setSpacePressed] = useState(false);

    const graph = useEditorStore((state) => state.graph);
    const viewport = useEditorStore((state) => state.viewport);
    const tool = useEditorStore((state) => state.tool);
    const armedDeviceKind = useEditorStore((state) => state.armedDeviceKind);
    const roomDraft = useEditorStore((state) => state.roomDraft);
    const scaleDraft = useEditorStore((state) => state.scaleDraft);
    const cableDraft = useEditorStore((state) => state.cableDraft);
    const backgroundImage = useEditorStore((state) => state.backgroundImage);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const selectedRoomId = useEditorStore((state) => state.selectedRoomId);
    const selectedEdgeId = useEditorStore((state) => state.selectedEdgeId);

    const scale = graph.floorPlan.scaleMetersPerPx;
    const background = graph.floorPlan.background;
    const backgroundKey = background?.dataUrl ?? '';

    useEffect(() => {
        const element = containerRef.current;
        if (element === null) {
            return;
        }
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect !== undefined) {
                setSize({
                    width: Math.max(1, Math.floor(rect.width)),
                    height: Math.max(1, Math.floor(rect.height)),
                });
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    // Восстановить растр подложки после импорта проекта.
    useEffect(() => {
        let cancelled = false;
        const store = useEditorStore.getState();
        if (background !== null) {
            restoreBackgroundImageAsync(background)
                .then((image) => {
                    if (!cancelled) {
                        store.setBackgroundImage(image);
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        store.setStatus('palette.backgroundError');
                    }
                });
        } else {
            store.setBackgroundImage(null);
        }
        return () => {
            cancelled = true;
        };
    }, [backgroundKey]);

    useEffect(() => {
        if (backgroundKey === '') {
            return;
        }
        const element = containerRef.current;
        useEditorStore.getState().fitView(
            element?.clientWidth ?? size.width,
            element?.clientHeight ?? size.height,
        );
    }, [backgroundKey]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (isEditingTarget(event.target)) {
                return;
            }
            const store = useEditorStore.getState();
            if (event.code === 'Space') {
                event.preventDefault();
                setSpacePressed(true);
            } else if (event.key === 'Enter' && store.tool === 'room') {
                store.finishRoom();
            } else if (event.key === 'Escape') {
                store.clearRoomDraft();
                store.setScaleDraft(null);
                store.cancelCable();
            } else if (event.key === 'Delete' || event.key === 'Backspace') {
                store.deleteSelected();
            }
        };
        const onKeyUp = (event: KeyboardEvent): void => {
            if (event.code === 'Space') {
                setSpacePressed(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    const handleWheel = (event: KonvaEventObject<WheelEvent>): void => {
        event.evt.preventDefault();
        const stage = event.target.getStage();
        const pointer = stage?.getPointerPosition();
        if (pointer === undefined || pointer === null) {
            return;
        }
        const factor = Math.exp(-event.evt.deltaY * 0.001);
        const store = useEditorStore.getState();
        store.setViewport(zoomAtPoint(store.viewport, pointer, factor));
    };

    const handleMouseDown = (event: KonvaEventObject<MouseEvent>): void => {
        const stage = event.target.getStage();
        const pointer = stage?.getPointerPosition();
        if (pointer === undefined || pointer === null) {
            return;
        }
        const store = useEditorStore.getState();
        if (event.evt.button === 1 || (spacePressed && event.evt.button === 0)) {
            event.evt.preventDefault();
            panRef.current = { x: event.evt.clientX, y: event.evt.clientY };
            return;
        }
        if (event.evt.button !== 0) {
            return;
        }
        const world = screenToWorld(pointer, store.viewport);
        if (store.tool === 'scale') {
            store.setScaleDraft({ start: world, end: world });
            drawingRef.current = true;
            return;
        }
        if (store.tool === 'room') {
            const first = store.roomDraft[0];
            if (first !== undefined && store.roomDraft.length >= 3 && distance(world, first) < 12 / store.viewport.scale) {
                store.finishRoom();
            } else {
                store.addRoomVertex(world);
            }
            return;
        }
        if (store.tool === 'device') {
            if (store.armedDeviceKind !== null) {
                store.addNode(store.armedDeviceKind, world);
            }
            return;
        }
        if (store.tool === 'cable') {
            if (store.cableDraft !== null) {
                store.addCableWaypoint(world);
            }
            return;
        }
        if (event.target === stage) {
            useEditorStore.getState().selectNode(null);
            useEditorStore.getState().selectRoom(null);
            useEditorStore.getState().selectEdge(null);
        }
    };

    const handleMouseMove = (event: KonvaEventObject<MouseEvent>): void => {
        const store = useEditorStore.getState();
        const pan = panRef.current;
        if (pan !== null) {
            const dx = event.evt.clientX - pan.x;
            const dy = event.evt.clientY - pan.y;
            panRef.current = { x: event.evt.clientX, y: event.evt.clientY };
            store.setViewport({ ...store.viewport, x: store.viewport.x + dx, y: store.viewport.y + dy });
        }
        const stage = event.target.getStage();
        const pointer = stage?.getPointerPosition();
        if (pointer === undefined || pointer === null) {
            return;
        }
        const world = screenToWorld(pointer, store.viewport);
        setCursor(world);
        if (store.tool === 'scale' && drawingRef.current && store.scaleDraft !== null) {
            store.setScaleDraft({ ...store.scaleDraft, end: world });
        }
    };

    const handleMouseUp = (): void => {
        panRef.current = null;
        drawingRef.current = false;
    };

    const handleDoubleClick = (): void => {
        const store = useEditorStore.getState();
        if (store.tool === 'room') {
            store.finishRoom();
        }
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
        event.preventDefault();
        const value = event.dataTransfer.getData('application/x-vwc-device');
        if (!isUiDeviceKind(value)) {
            return;
        }
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect === undefined) {
            return;
        }
        const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const store = useEditorStore.getState();
        store.addNode(value, screenToWorld(pointer, store.viewport));
    };

    const handleNodeSelect = (node: GraphNode): void => {
        const store = useEditorStore.getState();
        if (store.tool === 'cable') {
            if (store.cableDraft === null) {
                store.startCable(node.id);
            } else {
                store.finishCable(node.id);
            }
            return;
        }
        store.selectNode(node.id);
    };

    const roomDraftPoints = cursor === null ? roomDraft : [...roomDraft, cursor];
    const scaleDraftLength = scaleDraft === null ? 0 : distance(scaleDraft.start, scaleDraft.end);
    const cablePointsPx = cableDraft === null ? [] : [...cableDraft.waypointsPx, ...(cursor === null ? [] : [cursor])];
    const cableSourceNode = cableDraft === null
        ? undefined
        : graph.nodes.find((node) => node.id === cableDraft.sourceNodeId);

    return (
        <div
            className="relative h-full w-full overflow-hidden"
            style={{ backgroundColor: palette.background }}
        >
            <div
                ref={containerRef}
                data-editor-container
                className="h-full w-full"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
            >
                <Stage
                    width={size.width}
                    height={size.height}
                    x={viewport.x}
                    y={viewport.y}
                    scaleX={viewport.scale}
                    scaleY={viewport.scale}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onDblClick={handleDoubleClick}
                    onContextMenu={(event) => event.evt.preventDefault()}
                >
                    <Layer listening={false}>
                        {backgroundImage !== null && (
                            <KonvaImage image={backgroundImage} x={0} y={0} />
                        )}
                    </Layer>

                    <Layer listening={false}>
                        {graph.walls.map((wall) => {
                            const points = wall.path.map((point) => metersToPx(point, scale));
                            return (
                                <Line
                                    key={wall.id}
                                    points={flattenPoints(points)}
                                    stroke={wall.kind === 'doorway' ? palette.doorway : wall.kind === 'window' ? palette.window : palette.outlineVariant}
                                    strokeWidth={wall.kind === 'wall' ? 4 : 2}
                                    dash={wall.kind === 'partition' ? [8, 4] : undefined}
                                />
                            );
                        })}
                    </Layer>

                    <Layer>
                        {graph.rooms.map((room: RoomZone) => {
                            const points = room.polygon.map((point) => metersToPx(point, scale));
                            const centroid = polygonCentroid(points);
                            return (
                                <>
                                    <Line
                                        key={`${room.id}-fill`}
                                        points={flattenPoints(points)}
                                        closed
                                        fill={palette.rooms[room.type]}
                                        opacity={selectedRoomId === room.id ? 0.4 : 0.22}
                                        stroke={palette.rooms[room.type]}
                                        strokeWidth={2}
                                        onClick={() => useEditorStore.getState().selectRoom(room.id)}
                                    />
                                    <Text
                                        key={`${room.id}-label`}
                                        x={centroid.x - 90}
                                        y={centroid.y - 8}
                                        width={180}
                                        align="center"
                                        text={`${room.name} · ${t(`room.${room.type}` as TranslationKey)}`}
                                        fontSize={14}
                                        fill={palette.onSurface}
                                        listening={false}
                                    />
                                </>
                            );
                        })}
                    </Layer>

                    <Layer>
                        {graph.edges.map((edge) => {
                            const source = graph.nodes.find((node) => node.id === edge.from);
                            const target = graph.nodes.find((node) => node.id === edge.to);
                            const sourcePx = source?.planPosition === null || source === undefined
                                ? { x: 0, y: 0 }
                                : metersToPx(source.planPosition, scale);
                            const targetPx = target?.planPosition === null || target === undefined
                                ? { x: 0, y: 0 }
                                : metersToPx(target.planPosition, scale);
                            const pointsPx = edge.waypointsPx !== undefined && edge.waypointsPx.length > 1
                                ? edge.waypointsPx
                                : [sourcePx, ...(edge.waypointsPx ?? []), targetPx];
                            return (
                                <Line
                                    key={edge.id}
                                    points={flattenPoints(pointsPx)}
                                    stroke={selectedEdgeId === edge.id ? palette.highlight : palette.cable}
                                    strokeWidth={selectedEdgeId === edge.id ? 4 : 2}
                                    onClick={() => useEditorStore.getState().selectEdge(edge.id)}
                                />
                            );
                        })}
                    </Layer>

                    <Layer>
                        {graph.nodes.map((node) => {
                            const positionPx = node.planPosition === null
                                ? { x: 0, y: 0 }
                                : metersToPx(node.planPosition, scale);
                            return (
                                <DeviceNode
                                    key={node.id}
                                    node={node}
                                    positionPx={positionPx}
                                    selected={selectedNodeId === node.id}
                                    draggable={tool === 'select'}
                                    onSelect={() => handleNodeSelect(node)}
                                    onMove={(point) => useEditorStore.getState().moveNode(node.id, point)}
                                />
                            );
                        })}
                    </Layer>

                    <Layer listening={false}>
                        {tool === 'room' && roomDraftPoints.length > 1 && (
                            <>
                                <Line
                                    points={flattenPoints(roomDraftPoints)}
                                    stroke={palette.cable}
                                    strokeWidth={2}
                                    dash={[8, 5]}
                                />
                                {roomDraft.map((point, index) => (
                                    <Circle key={index} x={point.x} y={point.y} radius={5} fill={palette.cable} />
                                ))}
                            </>
                        )}
                        {tool === 'scale' && scaleDraft !== null && (
                            <>
                                <Line
                                    points={[scaleDraft.start.x, scaleDraft.start.y, scaleDraft.end.x, scaleDraft.end.y]}
                                    stroke={palette.scale}
                                    strokeWidth={3}
                                    dash={[8, 4]}
                                />
                                <Circle x={scaleDraft.start.x} y={scaleDraft.start.y} radius={6} fill={palette.scale} />
                                <Circle x={scaleDraft.end.x} y={scaleDraft.end.y} radius={6} fill={palette.scale} />
                                <Text
                                    x={(scaleDraft.start.x + scaleDraft.end.x) / 2 - 60}
                                    y={(scaleDraft.start.y + scaleDraft.end.y) / 2 - 24}
                                    width={120}
                                    align="center"
                                    text={`${scaleDraftLength.toFixed(0)} ${t('common.px')}`}
                                    fontSize={14}
                                    fill={palette.scale}
                                />
                            </>
                        )}
                        {tool === 'cable' && cableDraft !== null && (
                            <>
                                {cableSourceNode?.planPosition !== null && cableSourceNode !== undefined && (
                                    <Circle
                                        x={metersToPx(cableSourceNode.planPosition, scale).x}
                                        y={metersToPx(cableSourceNode.planPosition, scale).y}
                                        radius={14}
                                        stroke={palette.highlight}
                                        strokeWidth={3}
                                    />
                                )}
                                {cablePointsPx.length > 1 && (
                                    <Line
                                        points={flattenPoints(cablePointsPx)}
                                        stroke={palette.highlight}
                                        strokeWidth={3}
                                        dash={[8, 4]}
                                    />
                                )}
                                {cablePointsPx.map((point, index) => (
                                    <Circle key={index} x={point.x} y={point.y} radius={5} fill={palette.highlight} />
                                ))}
                            </>
                        )}
                    </Layer>
                </Stage>
            </div>

            <div
                className="pointer-events-none absolute bottom-3 left-3 rounded px-3 py-1 text-xs"
                style={{ backgroundColor: palette.surfaceContainer, color: palette.onSurfaceVariant }}
            >
                {t(`hint.${tool}` as TranslationKey)} · {Math.round(viewport.scale * 100)}%
                {armedDeviceKind !== null && tool === 'device' && ` · ${t(`device.${armedDeviceKind}` as TranslationKey)}`}
            </div>

            <ScaleCalibratorTool />
            <RoomZoneTool />
            <CableRouteTool />
        </div>
    );
}
