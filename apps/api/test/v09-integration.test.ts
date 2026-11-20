// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
/** Тесты прокси-эндпоинтов новых расчётов и инструментов ядра. */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalcEngineClient } from '../src/calc-engine/calc-engine.client.js';
import { CalcProxyController } from '../src/projects/calc-proxy.controller.js';
import { ProjectsService } from '../src/projects/projects.service.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const threePhaseResponse = {
    shortCircuitCurrentA: 2065,
    peakShortCircuitA: 3995,
    impactFactor: 1.368,
    loopImpedanceOhm: 0.112,
    breakingCapacityOk: true,
    warnings: [],
    references: ['PUE-SC-BREAKING-CAPACITY'],
    rulesVersion: '0.1',
};

const groundingResponse = {
    designResistivityOhmM: 130,
    seasonalFactor: 1.3,
    verticalElectrodeResistanceOhm: 45.7,
    horizontalStripResistanceOhm: 12.1,
    utilizationFactor: 0.75,
    groundingResistanceOhm: 20.3,
    requiredResistanceOhm: 4,
    groundingCompliant: false,
    protectionRadiusM: 22.5,
    protectionZoneType: 'A' as const,
    lightningCompliant: true,
    warnings: ['Увеличьте число заземлителей'],
    references: ['PUE-GR-4'],
    rulesVersion: '0.1',
};

describe('CalcProxyController', () => {
    const calc = {
        checkThreePhaseShortCircuitAsync: vi.fn(async () => threePhaseResponse),
        calculateGroundingAsync: vi.fn(async () => groundingResponse),
    };
    const projects = {
        getByIdAsync: vi.fn(async () => ({ id: PROJECT_ID })),
    };
    let controller: CalcProxyController;

    beforeEach(async () => {
        vi.clearAllMocks();
        const module = await Test.createTestingModule({
            controllers: [CalcProxyController],
            providers: [
                { provide: ProjectsService, useValue: projects },
                { provide: CalcEngineClient, useValue: calc },
            ],
        }).compile();
        controller = module.get(CalcProxyController);
    });

    it('проксирует расчёт трёхфазного КЗ в calc-engine', async () => {
        const response = await controller.threePhaseScAsync(PROJECT_ID, {
            voltageV: 400,
            resistanceOhm: 0.05,
            reactanceOhm: 0.1,
            breakingCapacityKa: 4.5,
        });

        expect(projects.getByIdAsync).toHaveBeenCalledWith(PROJECT_ID);
        expect(calc.checkThreePhaseShortCircuitAsync).toHaveBeenCalledTimes(1);
        expect(response.data.shortCircuitCurrentA).toBe(2065);
    });

    it('проксирует расчёт заземления и молниезащиты', async () => {
        const response = await controller.groundingAsync(PROJECT_ID, {
            burialDepthM: 1,
            verticalElectrodesCount: 3,
            verticalElectrodeLengthM: 3,
            verticalElectrodeDiameterM: 0.016,
            horizontalStripLengthM: 10,
            buildingHeightM: 10,
            lightningRodHeightM: 5,
            protectionHeightM: 0,
        });

        expect(calc.calculateGroundingAsync).toHaveBeenCalledTimes(1);
        expect(response.data.groundingCompliant).toBe(false);
        expect(response.data.protectionRadiusM).toBe(22.5);
    });
});
