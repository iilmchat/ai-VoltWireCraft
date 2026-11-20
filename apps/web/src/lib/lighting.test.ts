// © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
import { ProjectGraphSchema, type Point } from '@voltwirecraft/shared/graph.schema.js';
import { describe, expect, it } from 'vitest';
import { useEditorStore } from '../store/editorStore.js';
import { calculateLighting, fixturePositions, polygonAreaM2 } from './lighting.js';

/** Прямоугольная зона 4×5 м. */
const RECTANGLE: readonly Point[] = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 5 },
    { x: 0, y: 5 },
];

describe('светотехнический расчёт (СП 52.13330)', () => {
    it('вычисляет площадь по формуле Гаусса', () => {
        expect(polygonAreaM2(RECTANGLE)).toBeCloseTo(20);
        expect(polygonAreaM2([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
    });

    it('даёт детерминированное число светильников', () => {
        const request = {
            polygonM: RECTANGLE,
            ceilingHeightM: 2.7,
            roomType: 'living' as const,
            lumenPerFixture: 1200,
        };
        const first = calculateLighting(request);
        const second = calculateLighting(request);
        expect(first).toEqual(second);
        expect(first.areaM2).toBeCloseTo(20);
        expect(first.targetLux).toBe(150);
        expect(first.fixtureCount).toBeGreaterThan(0);
        expect(first.references).toContain('СП 52.13330.2016');
    });

    it('расставляет заданное число светильников внутри зоны', () => {
        const room = ProjectGraphSchema.parse({
            schemaVersion: 2,
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            name: 'Тест',
            floorPlan: { background: null, scaleMetersPerPx: 0.01, ceilingHeightM: 2.7 },
            rooms: [{
                id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                name: 'Комната',
                type: 'living',
                polygon: RECTANGLE,
            }],
            walls: [],
            nodes: [],
            edges: [],
        }).rooms[0];
        expect(room).toBeDefined();
        if (room === undefined) {
            return;
        }
        const positions = fixturePositions(room, 6);
        expect(positions).toHaveLength(6);
        expect(positions.every((point) => point.x >= 0 && point.x <= 4 && point.y >= 0 && point.y <= 5)).toBe(true);
    });

    it('сохраняет расстановку в стеке Undo', () => {
        const graph = useEditorStore.getState().graph;
        useEditorStore.setState({
            graph: ProjectGraphSchema.parse({
                ...graph,
                rooms: [{
                    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                    name: 'Комната',
                    type: 'living',
                    polygon: RECTANGLE,
                }],
                nodes: [],
                edges: [],
            }),
            past: [],
            future: [],
        });
        const count = useEditorStore.getState().addLightingFixtures(
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            [{ x: 2, y: 2 }],
            1200,
        );
        expect(count).toBe(1);
        expect(useEditorStore.getState().graph.nodes).toHaveLength(1);
        useEditorStore.getState().undo();
        expect(useEditorStore.getState().graph.nodes).toHaveLength(0);
    });
});
