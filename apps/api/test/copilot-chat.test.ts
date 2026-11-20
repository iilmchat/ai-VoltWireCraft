// © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
/** Тесты CopilotChatAgent: патч графа через инструменты, без записи в БД. */

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProjectGraph, type ProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import { CatalogService } from '../src/agents/catalog.service.js';
import { CopilotChatAgent } from '../src/agents/copilot-chat.agent.js';
import { LlmClient } from '../src/agents/llm.client.js';
import { NormativeService } from '../src/agents/normative.service.js';
import { ToolRegistry } from '../src/agents/tools.js';
import { IntegrationService } from '../src/integrations/integration.service.js';
import { CalcEngineClient } from '../src/calc-engine/calc-engine.client.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PANEL_ID = '11111111-1111-4111-8111-111111111111';
const SOCKET_ID = '22222222-2222-4222-8222-222222222222';

function makeGraph(): ProjectGraph {
    const graph = createEmptyProjectGraph('Тест', PROJECT_ID);
    graph.nodes.push(
        {
            id: PANEL_ID,
            kind: 'panel',
            label: 'Щит НКУ',
            planPosition: { x: 0, y: 0 },
            panelSlot: 1,
            specs: { ratedPower: 0, ratedCurrent: 63, crossSection: 16, mountingHeight: 1.5 },
        },
        {
            id: SOCKET_ID,
            kind: 'socket',
            label: 'Розетка',
            planPosition: { x: 2, y: 1 },
            panelSlot: null,
            specs: { ratedPower: 2000, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0.3 },
        },
    );
    graph.edges.push({
        id: randomUUID(),
        from: PANEL_ID,
        to: SOCKET_ID,
        cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu', length: 10 },
        waypointsM: [
            { x: 0, y: 0 },
            { x: 2, y: 1 },
        ],
    });
    return graph;
}

const panelResponse = {
    groups: [],
    phaseLoads: {
        L1: { powerW: 0, currentA: 0 },
        L2: { powerW: 0, currentA: 0 },
        L3: { powerW: 0, currentA: 0 },
    },
    imbalancePercent: 0,
    modules: [],
    usedDinModules: 0,
    enclosureModules: 0,
    warnings: [],
    references: ['PUE-RCD-FIRE-100'],
    rulesVersion: '0.1',
};

const lineResponse = {
    designCurrentA: 10.53,
    selectedCrossSectionMm2: 2.5 as const,
    permissibleCurrentA: 23,
    voltageDropPercent: 2.5,
    voltageDropLimitPercent: 5,
    breakerRatingA: 16,
    rcdCurrentMa: 30,
    rcdRequired: true,
    cableType: 'ВВГнг(А)-LS',
    recommendations: ['Установите УЗО 30 мА.'],
    references: ['PUE-1.3.4-T1-S2.5'],
    rulesVersion: '0.1',
};

describe('CopilotChatAgent', () => {
    const calc = {
        autoAssemblePanelAsync: vi.fn(async () => panelResponse),
        calculateLineSizingAsync: vi.fn(async () => lineResponse),
    };
    const catalog = {
        findByTypeAsync: vi.fn(async () => ({
            sku: 'KEAZ-1C16',
            brand: 'КЭАЗ',
            name: 'Автомат КЭАЗ',
            deviceType: 'circuit_breaker',
            ratedCurrentA: 16,
            widthModules: 1,
        })),
    };
    const llm = { generateExplanationAsync: vi.fn(async () => 'Пояснение агента') };
    let agent: CopilotChatAgent;

    beforeEach(async () => {
        vi.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                CopilotChatAgent,
                ToolRegistry,
                { provide: CalcEngineClient, useValue: calc },
                { provide: NormativeService, useValue: { searchAsync: vi.fn(async () => []) } },
                { provide: CatalogService, useValue: catalog },
                { provide: IntegrationService, useValue: { checkStockAsync: vi.fn(), createOrderAsync: vi.fn(), sendEstimateAsync: vi.fn(), buildBomFromGraph: vi.fn(() => []), statusAsync: vi.fn() } },
                { provide: LlmClient, useValue: llm },
            ],
        }).compile();
        agent = module.get(CopilotChatAgent);
    });

    it('по команде «мастер-выключатель» добавляет контактор и пересчитывает щит', async () => {
        const result = await agent.chatAsync(makeGraph(), { message: 'Добавь мастер-выключатель с контактором' });

        expect(calc.autoAssemblePanelAsync).toHaveBeenCalled();
        expect(result.proposedGraph?.nodes).toHaveLength(makeGraph().nodes.length + 2);
        expect(result.proposedGraph?.nodes.some((node) => node.kind === 'contactor')).toBe(true);
        expect(result.diffSummary.join(' ').toLowerCase()).toContain('мастер-выключатель');
        expect(result.toolCalls[0]?.tool).toBe('add_master_switch_tool');
        expect(result.citations).toContain('PUE-RCD-FIRE-100');
        expect(result.reply).toBe('Пояснение агента');
    });

    it('выделяет отдельную линию и переносит расчётные поля в кабель', async () => {
        const result = await agent.chatAsync(makeGraph(), {
            message: 'Выдели отдельную линию на Розетка 20 м',
        });

        expect(calc.calculateLineSizingAsync).toHaveBeenCalledWith(
            expect.objectContaining({ lengthM: 20, powerW: 2000 }),
        );
        expect(calc.autoAssemblePanelAsync).toHaveBeenCalled();
        const added = result.proposedGraph?.edges.at(-1);
        expect(added?.cableSpecs.calculatedCurrentA).toBe(10.53);
        expect(added?.cableSpecs.voltageDropPercent).toBe(2.5);
        expect(added?.cableSpecs.length).toBe(20);
        expect(result.toolCalls[0]?.tool).toBe('split_appliance_line_tool');
    });

    it('меняет бренд щита, подбирая артикулы из каталога', async () => {
        const result = await agent.chatAsync(makeGraph(), { message: 'Переведи щит на КЭАЗ' });

        expect(catalog.findByTypeAsync).toHaveBeenCalled();
        expect(calc.autoAssemblePanelAsync).toHaveBeenCalled();
        expect(result.proposedGraph?.nodes[0]?.label).toContain('KEAZ-1C16');
        expect(result.diffSummary.join(' ')).toContain('КЭАЗ');
    });

    it('не предлагает граф для нераспознанного сообщения', async () => {
        const result = await agent.chatAsync(makeGraph(), { message: 'Здравствуйте' });

        expect(result.proposedGraph).toBeUndefined();
        expect(result.toolCalls).toEqual([]);
        expect(result.diffSummary.length).toBeGreaterThan(0);
    });
});

describe('Эндпоинт чата', () => {
    it('возвращает предложение, не вызывая сохранение графа в БД', async () => {
        const graph = makeGraph();
        const response = {
            reply: 'Готово',
            diffSummary: ['Изменение'],
            toolCalls: [],
        };
        const service = {
            getByIdAsync: vi.fn(async () => ({ id: PROJECT_ID, graph })),
            updateGraphAsync: vi.fn(),
        };
        const copilot = { chatAsync: vi.fn(async () => response) };
        const { ProjectsController } = await import('../src/projects/projects.controller.js');
        const controller = new ProjectsController(
            service as never,
            {} as never,
            {} as never,
            copilot as never,
        );

        const result = await controller.chatAsync(PROJECT_ID, { message: 'Привет' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(response);
        expect(service.updateGraphAsync).not.toHaveBeenCalled();
    });
});
