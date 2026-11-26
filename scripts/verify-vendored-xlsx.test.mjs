// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Регрессионные тесты checksum gate для вендорированного SheetJS tarball. */

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  EXPECTED_SHA256,
  EXPECTED_SHA512_HEX,
  EXPECTED_SRI,
  vendoredXlsxPath,
  verifyVendoredXlsx,
} from './verify-vendored-xlsx.mjs';

const dir = mkdtempSync(join(tmpdir(), 'vwc-vendored-xlsx-'));
const realArchive = vendoredXlsxPath();

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('verify-vendored-xlsx', () => {
  it('pinned constants match the verified CDN artifact', () => {
    expect(EXPECTED_SHA256).toBe('8DC73FC3B00203E72D176E85B50938627C7B086E607C682E8D3C22C02BB99FE8');
    expect(EXPECTED_SHA512_HEX).toBe(
      'A0B0EADE3C3B01C2EA2961F60210A9553665F267FA5F661178FF8D7A1D12254CD5FC1759623B61F78B46E6DA22301D4F3EB62DC4E09F6A850292FB6E1FEDC024',
    );
    expect(EXPECTED_SRI).toBe(`sha512-${Buffer.from(EXPECTED_SHA512_HEX, 'hex').toString('base64')}`);
  });

  it('verified archive in the repository — PASS', () => {
    const result = verifyVendoredXlsx();
    expect(result.ok).toBe(true);
    expect(result.size).toBe(2409319);
    expect(result.sha256).toBe(EXPECTED_SHA256);
    expect(result.sri).toBe(EXPECTED_SRI);
  });

  it('copy of the verified archive — PASS', () => {
    const copy = join(dir, 'copy.tgz');
    copyFileSync(realArchive, copy);
    expect(verifyVendoredXlsx({ archivePath: copy }).ok).toBe(true);
  });

  it('missing file — FAIL', () => {
    const result = verifyVendoredXlsx({ archivePath: join(dir, 'missing.tgz') });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/не найден/);
  });

  it('modified archive — FAIL', () => {
    const modified = join(dir, 'modified.tgz');
    copyFileSync(realArchive, modified);
    const bytes = readFileSync(modified);
    bytes[128] = (bytes[128] ?? 0) ^ 0xff;
    writeFileSync(modified, bytes);
    const result = verifyVendoredXlsx({ archivePath: modified });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/SHA-256|SHA-512/);
  });

  it('arbitrary file at the expected path — FAIL', () => {
    const wrong = join(dir, 'wrong.tgz');
    writeFileSync(wrong, 'this is not the SheetJS tarball', 'utf8');
    expect(verifyVendoredXlsx({ archivePath: wrong }).ok).toBe(false);
  });

  it('directory instead of archive — FAIL', () => {
    const directory = join(dir, 'not-a-file.tgz');
    mkdirSync(directory);
    const result = verifyVendoredXlsx({ archivePath: directory });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/не является файлом/);
  });

  it('read error — controlled FAIL', () => {
    const result = verifyVendoredXlsx({
      archivePath: realArchive,
      readFile: () => {
        throw new Error('simulated EACCES');
      },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/EACCES/);
  });

  it('empty path — FAIL', () => {
    expect(verifyVendoredXlsx({ archivePath: '' }).ok).toBe(false);
  });
});
