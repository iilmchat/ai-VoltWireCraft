// © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
/** Интеграционные тесты v0.3: КЗ как инструмент, CAD-импорт и вызовы calc-engine. */

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createEmptyProjectGraph,
    type CadParseResponse,
    type ProjectDto,
    type ProjectGraph,
    type ShortCircuitResponse,
} from '@voltwirecraft/shared/graph.schema.js';
import { CatalogService } from '../src/agents/catalog.service.js';
import { LlmClient } from '../src/agents/llm.client.js';
import { NormativeService } from '../src/agents/normative.service.js';
import { PueAuditorAgent } from '../src/agents/pue-auditor.agent.js';
import { ToolRegistry } from '../src/agents/tools.js';
import { CalcEngineClient } from '../src/calc-engine/calc-engine.client.js';
import type { Env } from '../src/config/env.schema.js';
import type { Database } from '../src/database/drizzle.provider.js';
import { ProjectsController } from '../src/projects/projects.controller.js';
import { ProjectsService } from '../src/projects/projects.service.js';
import type { FloorPlanStorage } from '../src/projects/storage/floor-plan-storage.js';
import type { PanelArchitectAgent } from '../src/agents/panel-architect.agent.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BREAKER_ID = '11111111-1111-4111-8111-111111111111';
const SOCKET_ID = '22222222-2222-4222-8222-222222222222';

/** Граф с автоматом и линией для проверки КЗ. */
function makeGraph(): ProjectGraph {
    const graph = createEmptyProjectGraph('Тест', PROJECT_ID);
    graph.nodes.push(
        {
            id: BREAKER_ID,
            kind: 'circuit_breaker',
            label: 'Автомат C16',
            planPosition: null,
            panelSlot: 1,
            specs: { ratedPower: 0, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0 },
        },
        {
            id: SOCKET_ID,
            kind: 'socket',
            label: 'Розетка',
            planPosition: { x: 1, y: 1 },
            panelSlot: null,
            specs: { ratedPower: 1000, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0.3 },
        },
    );
    graph.edges.push({
        id: randomUUID(),
        from: BREAKER_ID,
        to: SOCKET_ID,
        cableSpecs: { crossSection: 2.5, conductorCount: 3, material: 'cu', length: 20 },
        waypointsM: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
        ],
    });
    return graph;
}

/** Ответ ядра для проверки КЗ. */
const shortCircuitResponse: ShortCircuitResponse = {
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
};

/** Ответ ядра разбора CAD. */
const cadResponse: CadParseResponse = {
    walls: [
        {
            kind: 'wall',
            path: [
                { x: 0, y: 0 },
                { x: 3, y: 0 },
            ],
            thickness: 0.2,
        },
    ],
    units: 'mm',
    entitiesProcessed: 3,
    warnings: [],
    rulesVersion: '0.1',
};

/** DTO проекта для подстановки в сервис. */
function projectDto(graph: ProjectGraph): ProjectDto {
    return {
        id: PROJECT_ID,
        title: 'Тест',
        objectType: 'house',
        networkSystem: 'tn-s',
        graph,
        createdAt: '2026-11-19T12:00:00.000Z',
        updatedAt: '2026-11-19T12:00:00.000Z',
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('CalcEngineClient v0.3', () => {
    function makeClient(): CalcEngineClient {
        return new CalcEngineClient({
            get: (key: string): unknown =>
                key === 'CALC_ENGINE_URL' ? 'http://calc-engine:8000' : undefined,
        } as unknown as ConfigService<Env, true>);
    }

    it('вызывает /v1/calc/short-circuit и проверяет ответ', async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify(shortCircuitResponse), { status: 200 }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await makeClient().checkShortCircuitAsync({
            transformerPowerKva: 100,
            cableLengthM: 20,
            crossSectionMm2: 2.5,
            breakerRatingA: 16,
        });

        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            'http://calc-engine:8000/v1/calc/short-circuit',
        );
        expect(result.shortCircuitCurrentA).toBe(650);
    });

    it('отправляет DXF multipart на /v1/cad/parse-dxf', async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify(cadResponse), { status: 200 }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await makeClient().parseDxfAsync({
            bytes: Buffer.from('%PDF-1.7'),
            fileName: 'plan.dxf',
        });

        expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://calc-engine:8000/v1/cad/parse-dxf');
        expect(result.walls).toHaveLength(1);
    });
});

describe('PueAuditorAgent: проверка КЗ через инструмент', () => {
    it('вызывает check_short_circuit_tool и добавляет находку', async () => {
        const calc = {
            checkShortCircuitAsync: vi.fn(async () => shortCircuitResponse),
            checkSelectivityTccAsync: vi.fn(async () => ({
                status: 'full' as const,
                selectivityLimitA: 100,
                breakingCapacityOk: true,
                totalVoltageDropPercent: 3.5,
                voltageDropOk: true,
                pairs: [],
                upstreamCurve: [],
                downstreamCurve: [],
                warnings: [],
                references: ['TCC-113'],
                rulesVersion: '0.1',
            })),
            calculateLineSizingAsync: vi.fn(async () => ({
                designCurrentA: 9.15,
                selectedCrossSectionMm2: 2.5 as const,
                permissibleCurrentA: 23,
                voltageDropPercent: 2.1,
                voltageDropLimitPercent: 5,
                breakerRatingA: 10,
                rcdCurrentMa: 30,
                rcdRequired: true,
                cableType: 'ВВГнг(А)-LS',
                recommendations: ['Установите УЗО.'],
                references: ['PUE-1.3.4-T1-S2.5'],
                rulesVersion: '0.1',
            })),
        };
        const module = await Test.createTestingModule({
            providers: [
                ToolRegistry,
                PueAuditorAgent,
                { provide: CalcEngineClient, useValue: calc },
                { provide: NormativeService, useValue: { searchAsync: vi.fn(async () => []) } },
                { provide: CatalogService, useValue: { findByTypeAsync: vi.fn(async () => null) } },
                { provide: LlmClient, useValue: { generateExplanationAsync: vi.fn(async () => 'Объяснение') } },
            ],
        }).compile();

        const auditor = module.get(PueAuditorAgent);
        const report = await auditor.auditAsync(PROJECT_ID, makeGraph());

        expect(calc.checkShortCircuitAsync).toHaveBeenCalled();
        expect(report.findings.some((item) => item.ruleId === 'PUE-SC-1.7-TIME-04')).toBe(true);
        expect(report.findings.some((item) => item.message.includes('I_кз'))).toBe(true);
    });
});

describe('ProjectsService.importCadAsync', () => {
    it('добавляет стены в граф через calc-engine и сохраняет проект', async () => {
        const graph = makeGraph();
        const calcClient = {
            parseDxfAsync: vi.fn(async () => cadResponse),
        };
        const service = new ProjectsService(
            {} as Database,
            {} as FloorPlanStorage,
            calcClient as unknown as CalcEngineClient,
        );
        vi.spyOn(service, 'getByIdAsync').mockResolvedValue(projectDto(graph));
        const update = vi
            .spyOn(service, 'updateGraphAsync')
            .mockImplementation(async (_id, nextGraph) => projectDto(nextGraph));

        const result = await service.importCadAsync(PROJECT_ID, {
            buffer: Buffer.from('  0\nSECTION\n'),
            originalname: 'plan.dxf',
            size: 15,
        });

        expect(calcClient.parseDxfAsync).toHaveBeenCalledTimes(1);
        expect(result.graph.walls).toHaveLength(1);
        expect(result.graph.walls[0]?.thickness).toBe(0.2);
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('передаёт DWG в calc-engine для конвертации (KI-005)', async () => {
        const graph = makeGraph();
        const calcClient = { parseDxfAsync: vi.fn(async () => cadResponse) };
        const service = new ProjectsService(
            {} as Database,
            {} as FloorPlanStorage,
            calcClient as unknown as CalcEngineClient,
        );
        vi.spyOn(service, 'getByIdAsync').mockResolvedValue(projectDto(graph));
        vi.spyOn(service, 'updateGraphAsync').mockImplementation(async (_id, nextGraph) => projectDto(nextGraph));

        const result = await service.importCadAsync(PROJECT_ID, {
            buffer: Buffer.from('AC1015'),
            originalname: 'plan.dwg',
            size: 6,
        });

        expect(calcClient.parseDxfAsync).toHaveBeenCalledWith(
            expect.objectContaining({ fileName: 'plan.dwg' }),
        );
        expect(result.graph.walls).toHaveLength(1);
    });
});

describe('ProjectsController.importCadAsync', () => {
    it('возвращает обновлённый проект в ApiResponse', async () => {
        const graph = makeGraph();
        const service = {
            importCadAsync: vi.fn(async () => projectDto(graph)),
        };
        const controller = new ProjectsController(
            service as unknown as ProjectsService,
            {} as PanelArchitectAgent,
            {} as PueAuditorAgent,
        );

        const response = await controller.importCadAsync(PROJECT_ID, {
            buffer: Buffer.from('  0\nSECTION\n'),
            originalname: 'plan.dxf',
            size: 15,
        });

        expect(response.success).toBe(true);
        expect(service.importCadAsync).toHaveBeenCalledTimes(1);
    });
});
