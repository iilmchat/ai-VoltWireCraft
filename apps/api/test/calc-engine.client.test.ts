// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Тесты CalcEngineClient: пути вызовов и Zod-валидация ответов ядра. */

import { BadGatewayException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AutoPanelRequest, LineSizingRequest } from '@voltwirecraft/shared/graph.schema.js';
import { CalcEngineClient } from '../src/calc-engine/calc-engine.client.js';
import type { Env } from '../src/config/env.schema.js';

const LINE_RESPONSE = {
    designCurrentA: 9.15,
    selectedCrossSectionMm2: 2.5,
    permissibleCurrentA: 23,
    voltageDropPercent: 2.1,
    voltageDropLimitPercent: 5,
    breakerRatingA: 10,
    rcdCurrentMa: 30,
    rcdRequired: true,
    cableType: 'ВВГнг(А)-LS',
    recommendations: ['Установите УЗО 30 мА.'],
    references: ['PUE-1.3.4-T1-S2.5'],
    rulesVersion: '0.1',
};

/** Создаёт клиент с мокнутой конфигурацией. */
function makeClient(): CalcEngineClient {
    const config = {
        get: (key: string): unknown =>
            key === 'CALC_ENGINE_URL' ? 'http://calc-engine:8000' : undefined,
    };
    return new CalcEngineClient(config as unknown as ConfigService<Env, true>);
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('CalcEngineClient', () => {
    it('отправляет расчёт линии на /v1/calc/line-sizing', async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify(LINE_RESPONSE), { status: 200 }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const request: LineSizingRequest = {
            powerW: 2000,
            voltageV: 230,
            phases: 1,
            powerFactor: 0.95,
            lengthM: 12,
        };

        const result = await makeClient().calculateLineSizingAsync(request);

        expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://calc-engine:8000/v1/calc/line-sizing');
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
            powerW: 2000,
            voltageV: 230,
        });
        expect(result.selectedCrossSectionMm2).toBe(2.5);
    });

    it('отправляет автосборку щита на /v1/calc/auto-panel', async () => {
        const autoPanelResponse = {
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
            references: [],
            rulesVersion: '0.1',
        };
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify(autoPanelResponse), { status: 200 }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const request: AutoPanelRequest = { nodes: [], rooms: [] };

        const result = await makeClient().autoAssemblePanelAsync(request);

        expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://calc-engine:8000/v1/calc/auto-panel');
        expect(result.enclosureModules).toBe(0);
    });

    it('отвергает ответ ядра, не проходящий Zod-валидацию', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })),
        );

        await expect(
            makeClient().calculateLineSizingAsync({
                powerW: 1000,
                voltageV: 230,
                phases: 1,
                powerFactor: 0.95,
                lengthM: 10,
            }),
        ).rejects.toBeInstanceOf(BadGatewayException);
    });
});
