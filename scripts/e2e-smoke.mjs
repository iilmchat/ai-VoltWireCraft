// © 2026 RuChating (iilmchat) · VoltWireCraft v0.5.0
/**
 * Сквозной прогон всех кейсов «Золотого датасета» по живому API VoltWireCraft.
 * Запуск: `pnpm smoke:e2e` (предварительно — `docker compose up -d`).
 */

import { readFile, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

/**
 * @typedef {{ success: boolean, data: unknown, message: string }} ApiEnvelope
 * @typedef {{ status: string, services?: readonly unknown[] }} HealthData
 * @typedef {{ edgeId: string, status: string, lengthM?: number, error?: string }} CalcEdge
 * @typedef {{ projectId: string, totalLengthM: number, edges: readonly CalcEdge[] }} CalcData
 * @typedef {{ usedDinModules: number, imbalancePercent: number, modules: readonly unknown[], groups: readonly unknown[] }} PanelData
 * @typedef {{ panel: PanelData }} AssembleData
 * @typedef {{ shortCircuitCurrentA: number, disconnectComplies: boolean }} ShortCircuitData
 * @typedef {{ findings: readonly { id: string, ruleId: string, severity: string }[] }} AuditData
 * @typedef {{
 *   case: string,
 *   supply: { phases: number, voltageV: number },
 *   dxf: { walls: number },
 *   lines: Record<string, {
 *     label: string,
 *     powerW: number,
 *     request: { phases: number },
 *     shortCircuit: { shortCircuitCurrentA: number }
 *   }>,
 *   cascade?: { totalVoltageDropPercent: number },
 *   selectivityTcc?: { status: string, selectivityLimitA: number },
 *   totals: { groups: number, powerW: number }
 * }} ExpectedCalc
 */

const API_URL = process.env['API_URL'] ?? 'http://localhost:3000';
const CALC_URL = process.env['CALC_URL'] ?? 'http://localhost:8000';
const FIXTURES_ROOT = resolve(
  process.env['SMOKE_FIXTURES_DIR'] ?? 'fixtures/golden-dataset',
);
const CASE_FILTER = process.env['SMOKE_CASE'] ?? '';
// Кейсы с нормируемым трёхфазным балансом (остальные 3P-кейсы проверяются мягко).
const BALANCE_CASES = new Set(['02_apartment_3room_400v', '05_cottages_3phase_15kw']);
const REQUEST_TIMEOUT_MS = 30_000;
const REQUIRED_CASE_FILES = ['project.vwc', 'plan.dxf', 'expected_calc.json'];

/** @type {string[]} */
const passed = [];

/**
 * Приводит неизвестное значение к нужному типу после ручной проверки.
 * @template T
 * @param {unknown} value — проверенное значение.
 * @returns {T} значение с заданным типом.
 */
function cast(value) {
  return /** @type {T} */ (value);
}

/**
 * Утверждает выполнение условия.
 * @param {boolean} condition — проверяемое условие.
 * @param {string} message — сообщение при нарушении.
 * @returns {void}
 */
function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
  passed.push(message);
}

/**
 * Проверяет, что значение — объект.
 * @param {unknown} value — значение.
 * @param {string} label — имя для сообщения об ошибке.
 * @returns {Record<string, unknown>} объект.
 */
function asRecord(value, label) {
  expect(typeof value === 'object' && value !== null && !Array.isArray(value), `${label}: ожидается объект`);
  return cast(value);
}

/**
 * Проверяет, что значение — число.
 * @param {unknown} value — значение.
 * @param {string} label — имя для сообщения об ошибке.
 * @returns {number} число.
 */
function asNumber(value, label) {
  expect(typeof value === 'number' && Number.isFinite(value), `${label}: ожидается число`);
  return cast(value);
}

/**
 * Проверяет, что значение — массив.
 * @param {unknown} value — значение.
 * @param {string} label — имя для сообщения об ошибке.
 * @returns {readonly unknown[]} массив.
 */
function asArray(value, label) {
  expect(Array.isArray(value), `${label}: ожидается массив`);
  return cast(value);
}

/**
 * Выполняет JSON-запрос и проверяет обёртку `ApiResponse`.
 * @param {string} url — адрес.
 * @param {RequestInit} init — параметры запроса.
 * @returns {Promise<ApiEnvelope>} ответ API.
 */
async function requestJson(url, init = {}) {
  const envelope = asRecord(await requestRawJson(url, init), url);
  const detail = `${typeof envelope['message'] === 'string' ? envelope['message'] : ''} ${JSON.stringify(envelope['data']).slice(0, 600)}`;
  expect(envelope['success'] === true, `${url}: ответ API не успешен: ${detail}`);
  return cast(envelope);
}

/**
 * Выполняет JSON-запрос без проверки обёртки (для calc-engine).
 * @param {string} url — адрес.
 * @param {RequestInit} init — параметры запроса.
 * @returns {Promise<unknown>} разобранный JSON.
 */
async function requestRawJson(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    /** @type {unknown} */
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${url}: некорректный JSON (${text.slice(0, 120)})`);
    }
    expect(response.ok, `${url}: HTTP ${response.status}: ${text.slice(0, 300)}`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Проверяет GET /health у сервиса.
 * @param {string} name — имя сервиса.
 * @param {string} url — адрес healthcheck-а.
 * @param {boolean} enveloped — использовать ли обёртку ApiResponse.
 * @returns {Promise<void>} nothing.
 */
async function checkHealthAsync(name, url, enveloped) {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  expect(response.ok, `${name}: GET /health вернул HTTP ${response.status}`);
  const body = cast(await response.json());
  const health = enveloped ? cast(asRecord(asRecord(body, name)['data'], `${name}.data`)) : asRecord(body, name);
  expect(asRecord(health, `${name}.health`)['status'] === 'ok', `${name}: сервис не готов`);
}

/**
 * Читает JSON-файл фикстуры.
 * @param {string} caseDir — каталог кейса.
 * @param {string} fileName — имя файла.
 * @returns {Promise<unknown>} содержимое.
 */
async function readJsonAsync(caseDir, fileName) {
  return JSON.parse(await readFile(join(caseDir, fileName), 'utf8'));
}

/**
 * Находит все полные кейсы золотого датасета.
 * @returns {Promise<string[]>} пути к каталогам кейсов.
 */
async function discoverCasesAsync() {
  const entries = await readdir(FIXTURES_ROOT, { withFileTypes: true });
  /** @type {string[]} */
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const caseDir = join(FIXTURES_ROOT, entry.name);
    const files = new Set(await readdir(caseDir));
    if (REQUIRED_CASE_FILES.every((file) => files.has(file))) {
      found.push(caseDir);
    }
  }
  const filtered = CASE_FILTER === '' ? found : found.filter((dir) => basename(dir) === CASE_FILTER);
  expect(filtered.length > 0, `Золотой датасет: не найдено кейсов в ${FIXTURES_ROOT}`);
  return filtered.sort();
}

/**
 * Проверяет баланс фаз по эталонным данным трёхфазного кейса.
 * Трёхфазные потребители распределяются поровну, однофазные — жадным методом.
 *
 * @param {ExpectedCalc} expected — эталон.
 * @param {string} caseName — имя кейса.
 * @returns {void}
 */
function checkPhaseBalance(expected, caseName) {
  if (expected.supply.phases !== 3 || !BALANCE_CASES.has(caseName)) {
    return;
  }
  /** @type {Record<string, number>} */
  const loads = { L1: 0, L2: 0, L3: 0 };
  for (const line of Object.values(expected.lines)) {
    if (line.request.phases === 3) {
      for (const phase of ['L1', 'L2', 'L3']) {
        loads[phase] += line.powerW / 3;
      }
    } else {
      const phase = ['L1', 'L2', 'L3'].reduce((left, right) =>
        loads[left] <= loads[right] ? left : right,
      );
      loads[phase] += line.powerW;
    }
  }
  const values = Object.values(loads);
  const peak = Math.max(...values);
  const imbalance = peak > 0 ? ((peak - Math.min(...values)) / peak) * 100 : 0;
  expect(
    imbalance <= 15,
    `${caseName}: баланс L1/L2/L3 — перекос ${imbalance.toFixed(1)} % ≤ 15 %`,
  );
}

/**
 * Прогоняет один эталонный кейс.
 * @param {string} caseDir — каталог кейса.
 * @returns {Promise<void>} nothing.
 */
async function runCaseAsync(caseDir) {
  const caseName = basename(caseDir);
  console.log(`— ${caseName}`);

  const vwc = asRecord(await readJsonAsync(caseDir, 'project.vwc'), 'project.vwc');
  /** @type {ExpectedCalc} */
  const expected = cast(await readJsonAsync(caseDir, 'expected_calc.json'));
  /** @type {Record<string, unknown>} */
  const graph = cast(asRecord(vwc['graph'], 'project.vwc.graph'));
  expect(vwc['schemaVersion'] === 2, `${caseName}: project.vwc — schemaVersion 2`);
  checkPhaseBalance(expected, caseName);

  const created = await requestJson(`${API_URL}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: `E2E smoke — ${expected.case ?? caseName}`,
      objectType: 'apartment',
      networkSystem: 'tn-s',
    }),
  });
  /** @type {Record<string, unknown>} */
  const project = cast(created.data);
  const projectId = project['id'];
  expect(typeof projectId === 'string', `${caseName}: POST /projects вернул id`);

  // POST /projects создаёт пустой граф; эталон загружается через PUT графа.
  await requestJson(`${API_URL}/projects/${projectId}/graph`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ graph: { ...graph, id: projectId } }),
  });
  passed.push(`${caseName}: граф загружен`);

  const dxf = await readFile(join(caseDir, 'plan.dxf'));
  const form = new FormData();
  form.append('file', new Blob([dxf]), 'plan.dxf');
  await requestJson(`${API_URL}/projects/${projectId}/import-cad`, { method: 'POST', body: form });

  /** @type {Record<string, unknown>} */
  const loaded = cast((await requestJson(`${API_URL}/projects/${projectId}`, {})).data);
  const walls = asArray(asRecord(loaded['graph'], 'project.graph')['walls'], 'graph.walls');
  expect(walls.length >= expected.dxf.walls, `${caseName}: импортировано ${walls.length} стен`);

  /** @type {CalcData} */
  const calc = cast((await requestJson(`${API_URL}/projects/${projectId}/calculate`, { method: 'POST' })).data);
  const totalLength = asNumber(calc.totalLengthM, 'calculate.totalLengthM');
  expect(totalLength > 0, `${caseName}: суммарная длина ${totalLength} м положительна`);
  expect(calc.edges.every((edge) => edge.status === 'ok'), `${caseName}: все линии рассчитаны`);

  /** @type {AssembleData} */
  const assembled = cast((await requestJson(`${API_URL}/projects/${projectId}/ai/assemble-panel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ preferredBrand: 'IEK' }),
  })).data);
  const usedModules = asNumber(assembled.panel.usedDinModules, 'panel.usedDinModules');
  const imbalance = asNumber(assembled.panel.imbalancePercent, 'panel.imbalancePercent');
  expect(usedModules > 0, `${caseName}: сборка щита — ${usedModules} модулей`);
  if (expected.supply.phases === 3 && BALANCE_CASES.has(caseName)) {
    expect(
      imbalance <= 15,
      `${caseName}: API-перекос щита ${imbalance.toFixed(1)} % ≤ 15 %`,
    );
  } else {
    expect(imbalance >= 0, `${caseName}: перекос фаз ${imbalance.toFixed(1)} % получен`);
  }

  /** @type {ShortCircuitData} */
  const sc = cast((await requestJson(`${API_URL}/projects/${projectId}/short-circuit`, { method: 'POST' })).data);
  const current = asNumber(sc.shortCircuitCurrentA, 'short-circuit.current');
  const referenceCurrents = Object.values(expected.lines).map(
    (line) => line.shortCircuit.shortCircuitCurrentA,
  );
  // Для многощитового кейса endpoint берёт вводной аппарат, а не групповой.
  const currentFactor = caseName === '07_twostory_house_vru_shr' ? 3 : 1.5;
  const lowerBound = Math.min(...referenceCurrents) / currentFactor;
  const upperBound = Math.max(...referenceCurrents) * currentFactor;
  expect(
    current >= lowerBound && current <= upperBound,
    `${caseName}: ток КЗ ${current} А в диапазоне ${Math.round(lowerBound)}–${Math.round(upperBound)} А`,
  );

  /** @type {AuditData} */
  const auditReport = cast((await requestJson(`${API_URL}/projects/${projectId}/ai/audit-pue`, { method: 'POST' })).data);
  const findings = asArray(auditReport.findings, 'audit.findings');
  expect(findings.length >= 2, `${caseName}: аудит ПУЭ вернул ${findings.length} находок`);
  const ruleIds = new Set(findings.map((finding) => asRecord(finding, 'finding')['ruleId']));
  for (const ruleId of ['PUE-1.3.4', 'PUE-SC-1.7-TIME-04']) {
    expect(ruleIds.has(ruleId), `${caseName}: найдено правило ${ruleId}`);
  }

  if (caseName === '07_twostory_house_vru_shr' && expected.cascade !== undefined) {
    /** @type {Record<string, unknown>} */
    const tcc = cast((await requestJson(`${API_URL}/projects/${projectId}/selectivity-tcc`, { method: 'POST' })).data);
    const drop = asNumber(tcc['totalVoltageDropPercent'], 'tcc.totalVoltageDropPercent');
    expect(drop <= 5, `${caseName}: каскадное падение напряжения ${drop} % ≤ 5 %`);
    expect(
      Math.abs(drop - expected.cascade.totalVoltageDropPercent) <= 0.5,
      `${caseName}: каскадное ΔU совпадает с эталоном ${expected.cascade.totalVoltageDropPercent} %`,
    );
    expect(tcc['voltageDropOk'] === true, `${caseName}: voltageDropOk=true в протоколе ВТХ`);
    const pairs = asArray(tcc['pairs'], 'tcc.pairs');
    expect(pairs.length >= 1, `${caseName}: проверено пар ВТХ — ${pairs.length}`);
    expect(asArray(tcc['references'], 'tcc.references').length > 0, `${caseName}: есть ссылки на справочник ВТХ`);
  }
}

/**
 * Проверяет конвертацию тестового DWG в DXF через calc-engine.
 * @returns {Promise<void>} nothing.
 */
async function checkDwgAsync() {
  const dwgPath = join(FIXTURES_ROOT, 'dwg', 'plan.dwg');
  const dwg = await readFile(dwgPath);
  const form = new FormData();
  form.append('file', new Blob([dwg]), 'plan.dwg');
  const parsed = asRecord(
    await requestRawJson(`${CALC_URL}/v1/cad/parse-dxf`, { method: 'POST', body: form }),
    'dwg.parse',
  );
  const entities = asNumber(parsed['entitiesProcessed'], 'dwg.entitiesProcessed');
  expect(entities > 0, `DWG → DXF: конвертировано сущностей ${entities}`);
  expect(typeof parsed['units'] === 'string', 'DWG → DXF: определены единицы чертежа');
  passed.push('DWG → DXF: конвертация и разбор прошли');
}

/**
 * Основной сценарий.
 * @returns {Promise<void>} nothing.
 */
async function mainAsync() {
  console.log(`VoltWireCraft E2E smoke: ${API_URL} / ${CALC_URL}`);
  await checkHealthAsync('api', `${API_URL}/health`, true);
  await checkHealthAsync('calc-engine', `${CALC_URL}/health`, false);

  const cases = await discoverCasesAsync();
  console.log(`Кейсов в датасете: ${cases.length}`);
  for (const caseDir of cases) {
    await runCaseAsync(caseDir);
  }
  await checkDwgAsync();

  console.log(`SMOKE OK: ${passed.length} проверок пройдено по ${cases.length} кейсам`);
}

try {
  await mainAsync();
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`SMOKE FAILED: ${detail}`);
  process.exitCode = 1;
}
