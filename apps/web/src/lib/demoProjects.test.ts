// © 2026 RuChating (iilmchat) · VoltWireCraft v0.5.0
import { ProjectGraphSchema } from '@voltwirecraft/shared/graph.schema.js';
import { describe, expect, it } from 'vitest';
import { DEMO_PROJECTS, getDemoByGraphId, getDemoProject } from './demoProjects.js';

describe('золотой датасет (демо-проекты)', () => {
    it('содержит шесть эталонных кейсов', () => {
        expect(DEMO_PROJECTS.map((project) => project.id)).toEqual([
            'studio-230v',
            'apartment-3room-400v',
            'house-bath-80m',
            'commercial-office-400v',
            'cottages-3phase-15kw',
            'apartment-2room-gas',
        ]);
    });

    it('каждый шаблон несёт корректные параметры для карточки выбора', () => {
        for (const demo of DEMO_PROJECTS) {
            expect(['230', '400']).toContain(demo.supply);
            expect(demo.powerKw).toBeGreaterThan(0);
            expect(demo.groups).toBeGreaterThan(0);
            expect(demo.nameKey).toMatch(/^demo\./);
            expect(demo.descriptionKey).toMatch(/^demo\./);
        }
    });

    it('каждый кейс даёт валидный канонический граф', () => {
        for (const demo of DEMO_PROJECTS) {
            const graph = demo.createGraph();
            expect(() => ProjectGraphSchema.parse(graph)).not.toThrow();
            expect(graph.schemaVersion).toBe(2);
            expect(graph.nodes.length).toBeGreaterThan(3);
            expect(graph.nodes.some((node) => node.panelSlot !== null)).toBe(true);
            expect(graph.edges.length).toBeGreaterThan(0);
            expect(graph.stampMeta?.projectCode).toBeTruthy();
        }
    });

    it('возвращает независимые графы при повторной загрузке', () => {
        const demo = getDemoProject('apartment-3room-400v');
        const first = demo.createGraph();
        const second = demo.createGraph();
        expect(first.id).toBe(second.id);
        expect(first.nodes).not.toBe(second.nodes);
        const firstNode = first.nodes[0];
        if (firstNode !== undefined) {
            firstNode.specs.ratedCurrent = 99;
        }
        expect(second.nodes[0]?.specs.ratedCurrent).not.toBe(99);
    });

    it('находит шаблон по идентификатору графа для бейджа фазности', () => {
        const demo = getDemoProject('cottages-3phase-15kw');
        expect(getDemoByGraphId(demo.createGraph().id)?.id).toBe('cottages-3phase-15kw');
        expect(getDemoByGraphId('00000000-0000-4000-8000-000000000000')).toBeUndefined();
    });
});
