// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Тесты ИИ-агентов: расчёты идут в calc-engine, LLM только объясняет. */

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createEmptyProjectGraph,
    type AutoPanelResponse,
    type LineSizingResponse,
    type ProjectGraph,
} from '@voltwirecraft/shared/graph.schema.js';
import { CatalogService } from '../src/agents/catalog.service.js';
import { LlmClient } from '../src/agents/llm.client.js';
import { NormativeService } from '../src/agents/normative.service.js';
import { PanelArchitectAgent } from '../src/agents/panel-architect.agent.js';
import { PueAuditorAgent } from '../src/agents/pue-auditor.agent.js';
import { ToolRegistry } from '../src/agents/tools.js';
import { CalcEngineClient } from '../src/calc-engine/calc-engine.client.js';
import { ProjectsController } from '../src/projects/projects.controller.js';
import type { ProjectsService } from '../src/projects/projects.service.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WET_ROOM = '11111111-1111-4111-8111-111111111111';
const BREAKER = '22222222-2222-4222-8222-222222222222';
const SOCKET = '33333333-3333-4333-8333-333333333333';

const panelResponse: AutoPanelResponse = {
    groups: [],
    phaseLoads: {
        L1: { powerW: 0, currentA: 0 },
        L2: { powerW: 0, currentA: 0 },
        L3: { powerW: 0, currentA: 0 },
    },
    imbalancePercent: 0,
    modules: [
        { kind: 'panel', label: 'Ввод', dinModules: 2, panelSlot: 1, groupId: null },
        { kind: 'rcd', label: 'Противопожарное УЗО', dinModules: 2, panelSlot: 2, groupId: null },
    ],
    usedDinModules: 4,
    enclosureModules: 5,
    warnings: [],
    references: ['PUE-RCD-FIRE-100'],
    rulesVersion: '0.1',
};

const lineResponse: LineSizingResponse = {
    designCurrentA: 9.15,
    selectedCrossSectionMm2: 2.5,
    permissibleCurrentA: 23,
    voltageDropPercent: 2.1,
    voltageDropLimitPercent: 5,
    breakerRatingA: 10,
    rcdCurrentMa: 30,
    rcdRequired: true,
    cableType: 'ВВГнг(А)-LS',
    recommendations: ['Установите УЗО/АВДТ с уставкой 30 мА.'],
    references: ['PUE-1.3.4-T1-S2.5'],
    rulesVersion: '0.1',
};

/** Граф с автоматом, розеткой в мокрой зоне и кабельной линией. */
function makeGraph(): ProjectGraph {
    const graph = createEmptyProjectGraph('Тест', PROJECT_ID);
    graph.rooms.push({
        id: WET_ROOM,
        name: 'Ванная',
        type: 'wet',
        polygon: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
        ],
    });
    graph.nodes.push(
        {
            id: BREAKER,
            kind: 'circuit_breaker',
            label: 'Автомат 32 А',
            planPosition: null,
            panelSlot: 1,
            roomId: null,
            specs: { ratedPower: 0, ratedCurrent: 32, crossSection: 2.5, mountingHeight: 0 },
        },
        {
            id: SOCKET,
            kind: 'socket',
            label: 'Розетка в ванной',
            planPosition: { x: 1, y: 1 },
            panelSlot: null,
            roomId: WET_ROOM,
            specs: { ratedPower: 2000, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0.3 },
        },
    );
    graph.edges.push({
        id: randomUUID(),
        from: BREAKER,
        to: SOCKET,
        cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu', length: 12 },
        waypointsM: [
            { x: 0, y: 0 },
            { x: 12, y: 0 },
        ],
    });
    return graph;
}

describe('ИИ-агенты', () => {
    const calc = {
        calculateCableLengthAsync: vi.fn(),
        calculateLineSizingAsync: vi.fn(async () => lineResponse),
        autoAssemblePanelAsync: vi.fn(async () => panelResponse),
        checkShortCircuitAsync: vi.fn(async () => ({
            transformerImpedanceOhm: 0.07,
            phaseResistanceOhm: 0.14,
            neutralResistanceOhm: 0.14,
            loopReactanceOhm: 0.003,
            loopImpedanceOhm: 0.35,
            shortCircuitCurrentA: 650,
            requiredMultiplicity: 10,
            minimumMultiplicity: 5,
            actualMultiplicity: 40,
            instantaneousTripA: 160,
            disconnectComplies: true,
            selectivityOk: true,
            upstreamToDownstreamRatio: 3.9,
            tripTimeS: 0.1,
            warnings: [],
            references: ['PUE-SC-1.7-TIME-04'],
            rulesVersion: '0.1',
        })),
        parseDxfAsync: vi.fn(),
    };
    const llm = { generateExplanationAsync: vi.fn(async () => 'Пояснение агентов') };
    const catalog = {
        findByTypeAsync: vi.fn(async () => ({
            sku: 'IEK-TEST-016',
            brand: 'IEK',
            name: 'Тестовый модуль',
            deviceType: 'panel',
            ratedCurrentA: 16,
            widthModules: 2,
        })),
    };
    const normative = {
        searchAsync: vi.fn(async () => [
            { ruleId: 'PUE-RCD-WET-30', excerpt: 'Влажные зоны: УЗО 30 мА', document: 'PUE-7' },
        ]),
        searchByEmbeddingAsync: vi.fn(),
    };
    let architect: PanelArchitectAgent;
    let auditor: PueAuditorAgent;

    beforeEach(async () => {
        vi.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                ToolRegistry,
                PanelArchitectAgent,
                PueAuditorAgent,
                { provide: CalcEngineClient, useValue: calc },
                { provide: LlmClient, useValue: llm },
                { provide: CatalogService, useValue: catalog },
                { provide: NormativeService, useValue: normative },
            ],
        }).compile();

        architect = module.get(PanelArchitectAgent);
        auditor = module.get(PueAuditorAgent);
    });

    it('PanelArchitect вызывает calc-engine и добавляет модули с артикулами', async () => {
        const graph = makeGraph();

        const result = await architect.assembleAsync(graph, { preferredBrand: 'IEK' });

        expect(calc.autoAssemblePanelAsync).toHaveBeenCalledTimes(1);
        expect(calc.autoAssemblePanelAsync).toHaveBeenCalledWith(
            expect.objectContaining({ nodes: graph.nodes, rooms: graph.rooms, preferredBrand: 'IEK' }),
        );
        expect(catalog.findByTypeAsync).toHaveBeenCalled();
        expect(result.graph.nodes).toHaveLength(graph.nodes.length + panelResponse.modules.length);
        expect(result.graph.nodes.slice(graph.nodes.length).every((node) => node.panelSlot !== null)).toBe(
            true,
        );
        expect(result.graph.nodes.at(-1)?.label).toContain('IEK-TEST-016');
        expect(result.explanation).toBe('Пояснение агентов');
        expect(result.toolCalls[0]?.tool).toBe('auto_assemble_panel_tool');
        expect(llm.generateExplanationAsync).toHaveBeenCalledTimes(1);
    });

    it('PanelArchitect передаёт 3P 400 В в calc-engine и подбирает 4P артикулы', async () => {
        const graph = makeGraph();
        graph.meta = {
            networkSystem: 'tn-s',
            supplyTopology: '3P_400V',
            panelPoles: 4,
        };
        graph.nodes.push({
            id: '44444444-4444-4444-8444-444444444444',
            kind: 'input_source',
            label: 'Ввод 400 В',
            planPosition: null,
            panelSlot: 1,
            specs: { ratedPower: 0, ratedCurrent: 63, crossSection: 16, mountingHeight: 0, phase: '3P', voltageV: 400 },
        });

        const result = await architect.assembleAsync(graph, { preferredBrand: 'IEK' });

        expect(calc.autoAssemblePanelAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                supply: expect.objectContaining({ voltageV: 400, phases: 3, supplyTopology: '3P_400V' }),
            }),
        );
        expect(result.panel.imbalancePercent).toBeLessThanOrEqual(15);
        expect(catalog.findByTypeAsync).toHaveBeenCalledWith(
            'rcd', 'IEK', expect.any(Number), expect.objectContaining({ poles: '4P', sType: true }),
        );
    });

    it('PueAuditor находит нарушения и цитирует справочник', async () => {
        const report = await auditor.auditAsync(PROJECT_ID, makeGraph());

        expect(calc.calculateLineSizingAsync).toHaveBeenCalledTimes(1);
        expect(normative.searchAsync).toHaveBeenCalledTimes(1);
        expect(report.projectId).toBe(PROJECT_ID);
        expect(report.summary.errors).toBeGreaterThanOrEqual(2);
        expect(report.findings.some((item) => item.ruleId.startsWith('PUE-BREAKER-S'))).toBe(true);
        expect(report.findings.some((item) => item.ruleId === 'PUE-RCD-WET-30')).toBe(true);
        expect(report.citations.some((item) => item.ruleId === 'PUE-1.3.4-T1-S2.5')).toBe(true);
        expect(report.rulesVersion).toBe('0.1');
        expect(report.explanation).toBe('Пояснение агентов');
    });

    it('LLM получает только факты инструментов, а не расчётные задачи', async () => {
        await auditor.auditAsync(PROJECT_ID, makeGraph());

        const prompt = llm.generateExplanationAsync.mock.calls[0]?.[0]?.prompt ?? '';
        expect(prompt).toContain('Инструменты');
        expect(prompt).not.toContain('посчитай');
    });
});

describe('Эндпоинты агентов', () => {
    it('assemble-panel сохраняет обновлённый граф через ProjectsService', async () => {
        const graph = makeGraph();
        const result = {
            graph,
            explanation: 'Готово',
            toolCalls: [],
            panel: panelResponse,
        };
        const service = {
            getByIdAsync: vi.fn(async () => ({ id: PROJECT_ID, graph })),
            updateGraphAsync: vi.fn(async () => ({ id: PROJECT_ID, graph })),
        };
        const controller = new ProjectsController(
            service as unknown as ProjectsService,
            { assembleAsync: vi.fn(async () => result) } as unknown as PanelArchitectAgent,
            {} as PueAuditorAgent,
        );

        const response = await controller.assemblePanelAsync(PROJECT_ID, {});

        expect(response.success).toBe(true);
        expect(service.updateGraphAsync).toHaveBeenCalledWith(PROJECT_ID, graph);
    });

    it('audit-pue возвращает отчёт, не изменяя граф', async () => {
        const report = {
            projectId: PROJECT_ID,
            findings: [],
            summary: { errors: 0, warnings: 0, info: 0 },
            citations: [],
            rulesVersion: '0.1',
            explanation: 'Нарушений нет',
        };
        const service = { getByIdAsync: vi.fn(async () => ({ id: PROJECT_ID, graph: makeGraph() })) };
        const controller = new ProjectsController(
            service as unknown as ProjectsService,
            {} as PanelArchitectAgent,
            { auditAsync: vi.fn(async () => report) } as unknown as PueAuditorAgent,
        );

        const response = await controller.auditPueAsync(PROJECT_ID);

        expect(response.data).toEqual(report);
        expect(response.success).toBe(true);
    });
});
