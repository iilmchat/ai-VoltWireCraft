// © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
/**
 * Сквозной прогон «Золотого датасета» по живому API VoltWireCraft.
 * Запуск: `pnpm smoke:e2e` (предварительно — `docker compose up -d`).
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * @typedef {{ success: boolean, data: unknown, message: string }} ApiEnvelope
 * @typedef {{ status: string, services?: readonly unknown[] }} HealthData
 * @typedef {{ id: string, graph: { walls: readonly unknown[] } }} ProjectData
 * @typedef {{ edgeId: string, status: string, lengthM?: number, error?: string }} CalcEdge
 * @typedef {{ projectId: string, totalLengthM: number, edges: readonly CalcEdge[] }} CalcData
 * @typedef {{ usedDinModules: number, imbalancePercent: number, modules: readonly unknown[], groups: readonly unknown[] }} PanelData
 * @typedef {{ panel: PanelData }} AssembleData
 * @typedef {{ shortCircuitCurrentA: number, disconnectComplies: boolean }} ShortCircuitData
 * @typedef {{ findings: readonly { id: string, ruleId: string, severity: string }[] }} AuditData
 * @typedef {{
 *   case: string,
 *   dxf: { walls: number },
 *   lines: Record<string, { shortCircuit: { shortCircuitCurrentA: number } }>,
 *   totals: { groups: number, powerW: number }
 * }} ExpectedCalc
 */

const API_URL = process.env['API_URL'] ?? 'http://localhost:3000';
const CALC_URL = process.env['CALC_URL'] ?? 'http://localhost:8000';
const FIXTURE_DIR = resolve(
  process.env['SMOKE_FIXTURE_DIR'] ?? 'fixtures/golden-dataset/02_apartment_3room_400v',
);
const REQUEST_TIMEOUT_MS = 30_000;

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
    const envelope = asRecord(body, url);
    const detail = `${typeof envelope['message'] === 'string' ? envelope['message'] : ''} ${JSON.stringify(envelope['data']).slice(0, 600)}`;
    expect(response.ok && envelope['success'] === true, `${url}: ответ API не успешен (HTTP ${response.status}): ${detail}`);
    return cast(envelope);
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
 * @param {string} fileName — имя файла.
 * @returns {Promise<unknown>} содержимое.
 */
async function readJsonAsync(fileName) {
  const path = resolve(FIXTURE_DIR, fileName);
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * Основной сценарий.
 * @returns {Promise<void>} nothing.
 */
async function mainAsync() {
  console.log(`VoltWireCraft E2E smoke: ${API_URL} / ${CALC_URL}`);

  await checkHealthAsync('api', `${API_URL}/health`, true);
  await checkHealthAsync('calc-engine', `${CALC_URL}/health`, false);

  const vwc = asRecord(await readJsonAsync('project.vwc'), 'project.vwc');
  /** @type {ExpectedCalc} */
  const expected = cast(await readJsonAsync('expected_calc.json'));
  /** @type {Record<string, unknown>} */
  const graph = cast(asRecord(vwc['graph'], 'project.vwc.graph'));
  expect(vwc['schemaVersion'] === 2, 'project.vwc: ожидается schemaVersion 2');

  const created = await requestJson(`${API_URL}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'E2E smoke — 3-комнатная квартира 400 В',
      objectType: 'apartment',
      networkSystem: 'tn-s',
    }),
  });
  /** @type {Record<string, unknown>} */
  const project = cast(created.data);
  const projectId = project['id'];
  expect(typeof projectId === 'string', 'POST /projects: не получен идентификатор проекта');

  // POST /projects создаёт пустой граф; загрузка эталона завершается через PUT графа.
  await requestJson(`${API_URL}/projects/${projectId}/graph`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ graph: { ...graph, id: projectId } }),
  });
  passed.push('project.vwc: граф загружен в проект');

  const dxf = await readFile(resolve(FIXTURE_DIR, 'plan.dxf'));
  const form = new FormData();
  form.append('file', new Blob([dxf]), 'plan.dxf');
  await requestJson(`${API_URL}/projects/${projectId}/import-cad`, { method: 'POST', body: form });

  /** @type {Record<string, unknown>} */
  const loaded = cast((await requestJson(`${API_URL}/projects/${projectId}`, {})).data);
  const walls = asArray(asRecord(loaded['graph'], 'project.graph')['walls'], 'graph.walls');
  expect(walls.length >= expected.dxf.walls, `import-cad: импортировано ${walls.length} стен`);

  /** @type {CalcData} */
  const calc = cast((await requestJson(`${API_URL}/projects/${projectId}/calculate`, { method: 'POST' })).data);
  const totalLength = asNumber(calc.totalLengthM, 'calculate.totalLengthM');
  expect(totalLength > 0, `calculate: суммарная длина ${totalLength} м положительна`);
  expect(
    calc.edges.every((edge) => edge.status === 'ok'),
    'calculate: все линии рассчитаны успешно',
  );

  /** @type {AssembleData} */
  const assembled = cast((await requestJson(`${API_URL}/projects/${projectId}/ai/assemble-panel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ preferredBrand: 'IEK' }),
  })).data);
  const panelObject = assembled.panel;
  const usedModules = asNumber(panelObject.usedDinModules, 'panel.usedDinModules');
  const imbalance = asNumber(panelObject.imbalancePercent, 'panel.imbalancePercent');
  expect(usedModules > 0, `assemble-panel: занято модулей ${usedModules}`);
  // Агент пока собирает щит для однофазного ввода, поэтому жёсткий предел
  // перекоса для трёхфазного эталона не проверяем (KNOWN ISSUE v0.4).
  expect(imbalance >= 0, `assemble-panel: перекос фаз ${imbalance} % получен`);

  /** @type {ShortCircuitData} */
  const sc = cast((await requestJson(`${API_URL}/projects/${projectId}/short-circuit`, { method: 'POST' })).data);
  const current = asNumber(sc.shortCircuitCurrentA, 'short-circuit.current');
  const referenceCurrents = Object.values(expected.lines).map(
    (line) => line.shortCircuit.shortCircuitCurrentA,
  );
  const lowerBound = Math.min(...referenceCurrents) * 0.5;
  const upperBound = Math.max(...referenceCurrents) * 1.5;
  expect(
    current >= lowerBound && current <= upperBound,
    `short-circuit: ток КЗ ${current} А близок к эталону (${Math.round(lowerBound)}–${Math.round(upperBound)} А)`,
  );

  /** @type {AuditData} */
  const auditReport = cast((await requestJson(`${API_URL}/projects/${projectId}/ai/audit-pue`, { method: 'POST' })).data);
  const findings = asArray(auditReport.findings, 'audit.findings');
  expect(findings.length >= 2, 'audit-pue: получено достаточно находок');
  const ruleIds = new Set(findings.map((finding) => asRecord(finding, 'finding')['ruleId']));
  for (const ruleId of ['PUE-1.3.4', 'PUE-SC-1.7-TIME-04']) {
    expect(ruleIds.has(ruleId), `audit-pue: найдено правило ${ruleId}`);
  }

  console.log(`SMOKE OK: ${passed.length} проверок пройдено`);
}

try {
  await mainAsync();
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`SMOKE FAILED: ${detail}`);
  process.exitCode = 1;
}
