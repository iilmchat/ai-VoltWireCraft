// © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
/** Тесты MCP-интеграций, светотехники и HITL-подтверждений. */

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createEmptyProjectGraph,
    type LightingCalcResponse,
    type ProjectGraph,
} from '@voltwirecraft/shared/graph.schema.js';
import { CalcEngineClient } from '../src/calc-engine/calc-engine.client.js';
import { ErpMcpService } from '../src/integrations/erp-mcp.service.js';
import { IntegrationService } from '../src/integrations/integration.service.js';
import { IntegrationsController } from '../src/integrations/integrations.controller.js';
import { ProjectsService } from '../src/projects/projects.service.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROOM_ID = '11111111-1111-4111-8111-111111111111';

/** Граф с комнатой для расчёта освещённости. */
function makeGraph(): ProjectGraph {
    const graph = createEmptyProjectGraph('Тест', PROJECT_ID);
    graph.rooms.push({
        id: ROOM_ID,
        name: 'Гостиная',
        type: 'living',
        polygon: [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 5 },
            { x: 0, y: 5 },
        ],
    });
    graph.nodes.push({
        id: randomUUID(),
        kind: 'circuit_breaker',
        label: 'Автомат (IEK-VA47-29-C16)',
        planPosition: null,
        panelSlot: 1,
        specs: { ratedPower: 0, ratedCurrent: 16, crossSection: 2.5, mountingHeight: 0 },
    });
    return graph;
}

const lightingResponse: LightingCalcResponse = {
    areaM2: 20,
    requiredLux: 150,
    roomIndex: 1.35,
    utilizationFactor: 0.53,
    recommendedLuminairesCount: 5,
    totalPowerW: 70,
    actualLux: 159,
    warnings: [],
    references: ['LIGHT-EN-LIVING'],
    rulesVersion: '0.1',
};

const stockResponse = {
    items: [{ sku: 'IEK-VA47-29-C16', quantity: 1, available: 12, sufficient: true }],
    allAvailable: true,
    operationId: 'op-stock-1',
};

const exportResponse = {
    success: true,
    target: 'moysklad',
    externalId: 'order-42',
    operationId: 'op-order-1',
    message: 'Готово',
};

describe('IntegrationService', () => {
    const mcp = {
        statusAsync: vi.fn(async () => [
            { server: 'moysklad', available: true, message: 'ok', tools: ['get_stock'] },
            { server: 'bitrix24', available: false, message: 'offline', tools: [] },
        ]),
        callToolAsync: vi.fn(async () => ({ data: stockResponse, operationId: 'op-stock-1' })),
    };
    let service: IntegrationService;

    beforeEach(async () => {
        vi.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [IntegrationService, { provide: ErpMcpService, useValue: mcp }],
        }).compile();
        service = module.get(IntegrationService);
    });

    it('возвращает статусы MCP-серверов', async () => {
        const statuses = await service.statusAsync();

        expect(statuses).toHaveLength(2);
        expect(statuses.some((item) => item.server === 'moysklad' && item.available)).toBe(true);
    });

    it('проверяет остатки через MCP get_stock', async () => {
        const result = await service.checkStockAsync([{ sku: 'IEK-VA47-29-C16', quantity: 1 }]);

        expect(mcp.callToolAsync).toHaveBeenCalledWith(
            'moysklad',
            'get_stock',
            expect.objectContaining({ items: expect.any(Array) }),
            expect.anything(),
        );
        expect(result.allAvailable).toBe(true);
    });

    it('собирает спецификацию из графа', () => {
        const items = service.buildBomFromGraph(makeGraph());

        expect(items.some((item) => item.sku === 'IEK-VA47-29-C16')).toBe(true);
    });

    it('передаёт HITL-токен при создании заказа', async () => {
        mcp.callToolAsync.mockResolvedValueOnce({ data: exportResponse, operationId: 'op-order-1' });

        await service.createOrderAsync({
            projectId: PROJECT_ID,
            target: 'moysklad',
            items: [{ sku: 'IEK-VA47-29-C16', quantity: 1 }],
            confirmationToken: 'confirm-123',
        });

        expect(mcp.callToolAsync).toHaveBeenCalledWith(
            'moysklad',
            'create_order',
            expect.anything(),
            expect.anything(),
            'confirm-123',
        );
    });
});

describe('IntegrationsController', () => {
    const lighting = { calculateLightingAsync: vi.fn(async () => lightingResponse) };
    const integrations = {
        statusAsync: vi.fn(async () => []),
        checkStockAsync: vi.fn(async () => stockResponse),
        createOrderAsync: vi.fn(async () => ({ ...exportResponse, target: 'moysklad' as const })),
        sendEstimateAsync: vi.fn(async () => ({
            ...exportResponse,
            target: 'bitrix24' as const,
            externalId: 'deal-7',
        })),
        buildBomFromGraph: vi.fn(() => [{ sku: 'IEK-VA47-29-C16', quantity: 1 }]),
    };
    const projects = { getByIdAsync: vi.fn(async () => ({ id: PROJECT_ID, graph: makeGraph() })) };
    let controller: IntegrationsController;

    beforeEach(async () => {
        vi.clearAllMocks();
        const module = await Test.createTestingModule({
            controllers: [IntegrationsController],
            providers: [
                { provide: ProjectsService, useValue: projects },
                { provide: CalcEngineClient, useValue: lighting },
                { provide: IntegrationService, useValue: integrations },
            ],
        }).compile();
        controller = module.get(IntegrationsController);
    });

    it('передаёт геометрию комнаты в расчёт освещённости', async () => {
        const response = await controller.calculateLightingAsync(PROJECT_ID, {
            roomId: ROOM_ID,
            luminaireFluxLm: 1200,
            luminairePowerW: 14,
        });

        expect(lighting.calculateLightingAsync).toHaveBeenCalledWith(
            expect.objectContaining({ zoneType: 'living', polygonM: expect.any(Array) }),
        );
        expect(response.data.actualLux).toBe(159);
    });

    it('проверяет остатки, собирая позиции из графа', async () => {
        const response = await controller.checkStockAsync(PROJECT_ID, {});

        expect(integrations.buildBomFromGraph).toHaveBeenCalled();
        expect(response.data.allAvailable).toBe(true);
    });

    it('создаёт заказ только с токеном подтверждения', async () => {
        const response = await controller.createOrderAsync(PROJECT_ID, {
            items: [{ sku: 'IEK-VA47-29-C16', quantity: 1 }],
            confirmationToken: 'confirm-123',
        });

        expect(integrations.createOrderAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: PROJECT_ID,
                target: 'moysklad',
                confirmationToken: 'confirm-123',
            }),
        );
        expect(response.data.externalId).toBe('order-42');
    });

    it('отправляет смету в сделку Битрикс24 с подтверждением', async () => {
        const response = await controller.sendEstimateAsync(PROJECT_ID, {
            items: [{ sku: 'IEK-VA47-29-C16', quantity: 1 }],
            dealId: 'deal-7',
            confirmationToken: 'confirm-456',
        });

        expect(integrations.sendEstimateAsync).toHaveBeenCalledWith(
            expect.objectContaining({ target: 'bitrix24', dealId: 'deal-7', confirmationToken: 'confirm-456' }),
        );
        expect(response.data.externalId).toBe('deal-7');
    });
});

describe('CalcEngineClient: lighting', () => {
    it('вызывает /v1/calc/lighting и проверяет ответ', async () => {
        const config = {
            get: (key: string): unknown =>
                key === 'CALC_ENGINE_URL' ? 'http://calc-engine:8000' : undefined,
        };
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(lightingResponse), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const client = new CalcEngineClient(config as never);

        const result = await client.calculateLightingAsync({
            areaM2: 20,
            ceilingHeightM: 2.7,
            zoneType: 'living',
            luminaireFluxLm: 1200,
            luminairePowerW: 14,
        });

        expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://calc-engine:8000/v1/calc/lighting');
        expect(result.actualLux).toBe(159);
    });
});
