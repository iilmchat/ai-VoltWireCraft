// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
    createEmptyProjectGraph,
    ElectricalDeviceSchema,
    metersToPixels,
    pixelsToMeters,
    ProjectGraphSchema,
    RoomZoneSchema,
    UuidSchema,
    VwcFileSchema,
} from './index.js';

describe('контракты графа проекта', () => {
    it('createEmptyProjectGraph возвращает граф, проходящий ProjectGraphSchema', () => {
        const graph = createEmptyProjectGraph();
        expect(ProjectGraphSchema.safeParse(graph).success).toBe(true);
    });

    it('VwcFile, собранный из пустого графа, проходит VwcFileSchema', () => {
        const graph = createEmptyProjectGraph();
        const file: z.input<typeof VwcFileSchema> = {
            format: 'vwc-project',
            schemaVersion: 1,
            graph,
            savedAt: new Date('2026-11-19T12:00:00.000Z').toISOString(),
        };
        expect(VwcFileSchema.safeParse(file).success).toBe(true);
    });

    it('ProjectGraphSchema отклоняет граф с schemaVersion 2', () => {
        const graph = createEmptyProjectGraph();
        expect(ProjectGraphSchema.safeParse({ ...graph, schemaVersion: 2 }).success).toBe(false);
    });

    it('ElectricalDeviceSchema отклоняет устройство с недопустимым видом', () => {
        const badDevice = {
            id: '00000000-0000-4000-8000-000000000001',
            kind: 'board',
            ugo: 'ЩР1',
            position: { x: 0, y: 0 },
            powerW: 1000,
            mountingHeightM: 1.5,
            roomId: null,
        };
        expect(ElectricalDeviceSchema.safeParse(badDevice).success).toBe(false);
    });

    it('RoomZoneSchema отклоняет многоугольник из двух вершин', () => {
        const badRoom = {
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Кухня',
            type: 'kitchen',
            polygon: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
            ],
        };
        expect(RoomZoneSchema.safeParse(badRoom).success).toBe(false);
    });

    it('UuidSchema отклоняет строку, не являющуюся UUID', () => {
        const value: unknown = z.string().parse('не-uuid');
        expect(UuidSchema.safeParse(value).success).toBe(false);
    });
});

describe('преобразование единиц измерения', () => {
    it('метры переводятся в пиксели и обратно', () => {
        const point = { x: 2, y: 3 };
        const pixels = metersToPixels(point, 0.5);
        expect(pixels).toEqual({ x: 4, y: 6 });
        expect(pixelsToMeters(pixels, 0.5)).toEqual(point);
    });
});
