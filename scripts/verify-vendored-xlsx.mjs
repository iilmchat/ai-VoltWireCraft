// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * Supply-chain gate: проверка целостности вендорированного официального tarball SheetJS.
 *
 * Источник: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
 * Ожидаемые значения зафиксированы при прямом получении архива с официального CDN.
 * Скрипт не использует сеть и не выводит содержимое архива.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Относительный путь вендорированного архива от корня repository. */
export const VENDOR_RELATIVE_PATH = 'apps/web/vendor/xlsx-0.20.3.tgz';

/** Полный SHA-256 в hex (регистр не важен при сравнении). */
export const EXPECTED_SHA256 = '8DC73FC3B00203E72D176E85B50938627C7B086E607C682E8D3C22C02BB99FE8';

/** Полный SHA-512 в hex — для документации и проверки SRI. */
export const EXPECTED_SHA512_HEX =
  'A0B0EADE3C3B01C2EA2961F60210A9553665F267FA5F661178FF8D7A1D12254CD5FC1759623B61F78B46E6DA22301D4F3EB62DC4E09F6A850292FB6E1FEDC024';

/** Subresource integrity в формате, который записывается в pnpm-lock.yaml. */
export const EXPECTED_SRI =
  'sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Абсолютный путь к архиву по умолчанию. */
export function vendoredXlsxPath() {
  return resolve(REPO_ROOT, VENDOR_RELATIVE_PATH);
}

/**
 * Проверяет вендорированный архив.
 * @param {object} options — путь, ожидаемые хэши и функция чтения (для тестов).
 * @returns {{ok: boolean, problems: string[], archivePath: string, size?: number, sha256?: string, sri?: string}}
 */
export function verifyVendoredXlsx(options = {}) {
  const {
    archivePath = vendoredXlsxPath(),
    expectedSha256 = EXPECTED_SHA256,
    expectedSri = EXPECTED_SRI,
    readFile = readFileSync,
  } = options;

  if (typeof archivePath !== 'string' || archivePath.length === 0) {
    return { ok: false, problems: ['не задан путь к вендорированному архиву'], archivePath: String(archivePath) };
  }
  if (!existsSync(archivePath)) {
    return { ok: false, problems: [`файл не найден: ${archivePath}`], archivePath };
  }

  try {
    if (!statSync(archivePath).isFile()) {
      return { ok: false, problems: [`путь не является файлом: ${archivePath}`], archivePath };
    }
  } catch (error) {
    return {
      ok: false,
      problems: [`ошибка проверки файла: ${error instanceof Error ? error.message : String(error)}`],
      archivePath,
    };
  }

  let bytes;
  try {
    bytes = readFile(archivePath);
  } catch (error) {
    return {
      ok: false,
      problems: [`ошибка чтения архива: ${error instanceof Error ? error.message : String(error)}`],
      archivePath,
    };
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const sri = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const result = { ok: true, problems: [], archivePath, size: bytes.length, sha256, sri };

  if (sha256 !== String(expectedSha256).toUpperCase()) {
    result.problems.push(`SHA-256 не совпадает: ${sha256} != ${expectedSha256}`);
  }
  if (sri !== expectedSri) {
    result.problems.push(`SHA-512 SRI не совпадает: ${sri} != ${expectedSri}`);
  }
  result.ok = result.problems.length === 0;
  return result;
}

function main() {
  const result = verifyVendoredXlsx();
  console.log(`Vendored SheetJS: ${result.archivePath} (${result.size ?? 0} bytes)`);
  if (!result.ok) {
    console.error(`Vendored XLSX checksum FAILED: ${result.problems.join('; ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Vendored XLSX checksum PASSED sha256=${result.sha256} sri=${result.sri}`);
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main();
}
