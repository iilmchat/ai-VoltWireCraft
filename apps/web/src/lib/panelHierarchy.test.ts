// © 2026 RuChating (iilmchat) · VoltWireCraft v0.6.0
import { ProjectGraphSchema } from '@voltwirecraft/shared/graph.schema.js';
import { describe, expect, it } from 'vitest';
import { getDemoProject } from './demoProjects.js';
import {
    getEdgesForPanel,
    getFeederEdges,
    getNodesForPanel,
    getPanels,
    resolveActivePanelId,
} from './panelHierarchy.js';

/** Граф многощитового эталонного проекта. */
function multiPanelGraph() {
    return ProjectGraphSchema.parse(getDemoProject('twostory-house-vru-shr').createGraph());
}

describe('иерархия щитов (Graph-First)', () => {
    it('определяет корень и дочерние щиты', () => {
        const graph = multiPanelGraph();
        const panels = getPanels(graph);
        expect(panels).toHaveLength(3);
        expect(panels[0]?.role).toBe('main_vru');
        expect(panels[0]?.parentPanelId).toBeNull();
        expect(panels[0]?.children).toHaveLength(2);
    });

    it('разрешает активный щит и возвращается к корню при неверном идентификаторе', () => {
        const graph = multiPanelGraph();
        const panels = getPanels(graph);
        const child = panels[1];
        expect(child).toBeDefined();
        if (child === undefined) {
            return;
        }
        expect(resolveActivePanelId(graph, child.node.id)).toBe(child.node.id);
        expect(resolveActivePanelId(graph, 'missing')).toBe(panels[0]?.node.id);
    });

    it('фильтрует узлы и линии по активному щиту, не изменяя граф', () => {
        const graph = multiPanelGraph();
        const panels = getPanels(graph);
        const child = panels[1];
        if (child === undefined) {
            return;
        }
        const nodes = getNodesForPanel(graph, child.node.id);
        expect(nodes.some((node) => node.id === child.node.id)).toBe(true);
        expect(nodes.every((node) => node.kind !== 'panel' || node.id === child.node.id)).toBe(true);
        expect(getEdgesForPanel(graph, child.node.id).some((edge) => edge.edgeType === 'feeder_line')).toBe(true);
        expect(graph.nodes).toHaveLength(multiPanelGraph().nodes.length);
    });

    it('находит все питающие магистрали', () => {
        expect(getFeederEdges(multiPanelGraph())).toHaveLength(2);
    });
});
