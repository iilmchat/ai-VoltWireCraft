// © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
/** Регрессионные тесты «Золотого датасета» на уровне контрактов shared. */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    parseVwcFile,
    ProjectGraphSchema,
} from '@voltwirecraft/shared/graph.schema.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/golden-dataset', import.meta.url));
const CASES = readdirSync(FIXTURES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(FIXTURES, entry.name, 'project.vwc')))
    .map((entry) => entry.name)
    .sort();

/** Читает JSON эталонного кейса. */
function loadExpected(caseName: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(FIXTURES, caseName, 'expected_calc.json'), 'utf8')) as Record<string, unknown>;
}

describe('golden dataset', () => {
    it('содержит шесть эталонных кейсов с полным комплектом файлов', () => {
        expect(CASES).toEqual([
            '01_studio_230v',
            '02_apartment_3room_400v',
            '03_house_bath_long_line',
            '04_commercial_office_400v',
            '05_cottages_3phase_15kw',
            '06_apartment_2room_gas',
        ]);
        for (const caseName of CASES) {
            for (const file of ['plan.dxf', 'project.vwc', 'expected_calc.json']) {
                expect(readFileSync(join(FIXTURES, caseName, file)).length).toBeGreaterThan(0);
            }
        }
    });

    it.each(CASES)('%s: .vwc проходит Zod-валидацию без миграции', (caseName) => {
        const raw: unknown = JSON.parse(readFileSync(join(FIXTURES, caseName, 'project.vwc'), 'utf8'));
        const file = parseVwcFile(raw);

        expect(file.schemaVersion).toBe(2);
        expect(ProjectGraphSchema.safeParse(file.graph).success).toBe(true);
        expect(file.graph.stampMeta?.projectCode).toBe(caseName);
        const expected = loadExpected(caseName);
        const totals = expected['totals'] as Record<string, number>;
        expect(file.graph.edges).toHaveLength(totals['groups'] as number);
        expect(file.graph.walls).toHaveLength((expected['dxf'] as Record<string, number>)['walls'] as number);
    });

    it.each(CASES)('%s: мощности узлов совпадают с эталоном', (caseName) => {
        const raw: unknown = JSON.parse(readFileSync(join(FIXTURES, caseName, 'project.vwc'), 'utf8'));
        const graph = parseVwcFile(raw).graph;
        const expected = loadExpected(caseName);
        const totals = expected['totals'] as Record<string, number>;
        const actualPower = graph.nodes.reduce((sum, node) => sum + node.specs.ratedPower, 0);

        expect(actualPower).toBe(totals['powerW'] as number);
    });
});
