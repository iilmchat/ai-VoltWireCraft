// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Регрессионный тест экспорта BOM в XLSX через вендорированный SheetJS 0.20.3. */

import * as nodeFs from 'node:fs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { afterAll, describe, expect, it } from 'vitest';
import type { BomRow } from './bomExport.js';
import { exportBomXlsxAsync } from './bomExport.js';

// В Node ESM-сборка SheetJS требует явной инъекции fs; браузер использует DOM download.
XLSX.set_fs(nodeFs);

const dir = mkdtempSync(join(tmpdir(), 'vwc-bom-xlsx-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const HEADERS = ['Наименование', 'Кол-во', 'Длина, м', 'Артикул', 'Цена, ₽', 'Сумма, ₽'];

const ROWS: BomRow[] = [
    {
        name: 'ВВГнг(А)-LS 3x2.5',
        quantity: 4,
        lengthM: 12.5,
        article: 'ВВГнг(А)-LS 3x2.5',
        priceRub: 300,
        totalRub: 3750,
    },
    {
        name: 'Автомат C16',
        quantity: 1,
        lengthM: null,
        article: 'IEK C16 1P',
        priceRub: 450,
        totalRub: 450,
    },
];

describe('exportBomXlsxAsync (SheetJS 0.20.3)', () => {
    it('creates a real .xlsx with the Спецификация sheet and preserved values', async () => {
        const path = join(dir, 'bom');
        await exportBomXlsxAsync(ROWS, path, HEADERS);
        const file = `${path}.xlsx`;

        const bytes = readFileSync(file);
        expect(bytes.length).toBeGreaterThan(100);
        expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK');

        const workbook = XLSX.readFile(file);
        expect(workbook.SheetNames).toContain('Спецификация');

        const grid = XLSX.utils.sheet_to_json<(string | number)[]>(
            workbook.Sheets['Спецификация'],
            { header: 1, defval: '' },
        );
        expect(grid[0]).toEqual(HEADERS);
        expect(grid[1]).toEqual([ROWS[0]!.name, 4, 12.5, 'ВВГнг(А)-LS 3x2.5', 300, 3750]);
        expect(grid[2]).toEqual([ROWS[1]!.name, 1, '', 'IEK C16 1P', 450, 450]);
    });

    it('does not duplicate the .xlsx extension', async () => {
        const path = join(dir, 'already.xlsx');
        await exportBomXlsxAsync(ROWS.slice(0, 1), path, HEADERS);
        expect(readFileSync(path).subarray(0, 2).toString('ascii')).toBe('PK');
        expect(() => readFileSync(`${path}.xlsx`)).toThrow();
    });
});
