// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * CI gate: интеграционные тесты с реальными PostgreSQL 17 и Redis обязательны.
 * Строгая валидация XML + разбор дерева (fast-xml-parser), без самодельного парсера.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

/**
 * Обязательные suite и минимальное число тестов.
 * Источник: baseline JUnit artifact 15014845219, run 45597733577
 * (commit 28b95144532cab1e75f054b78d332208e912556f), 25 suite / 215 testcase.
 * Увеличение числа тестов разрешено; уменьшение требует обновления manifest.
 */
export const SUITE_MANIFEST = Object.freeze([
  { suiteName: 'test/agents.test.ts', minTests: 7 },
  { suiteName: 'test/app.bootstrap.test.ts', minTests: 3 },
  { suiteName: 'test/assemble-panel-authorization.test.ts', minTests: 4 },
  { suiteName: 'test/auth-rate-limit.test.ts', minTests: 11 },
  { suiteName: 'test/auth.test.ts', minTests: 6 },
  { suiteName: 'test/calc-engine.client.test.ts', minTests: 4 },
  { suiteName: 'test/catalog-and-calculation.test.ts', minTests: 5 },
  { suiteName: 'test/copilot-chat.test.ts', minTests: 5 },
  { suiteName: 'test/env.schema.test.ts', minTests: 16 },
  { suiteName: 'test/erp-hitl-integration.test.ts', minTests: 20 },
  { suiteName: 'test/golden-dataset.test.ts', minTests: 15 },
  { suiteName: 'test/health.controller.test.ts', minTests: 2 },
  { suiteName: 'test/integrations.test.ts', minTests: 9 },
  { suiteName: 'test/origin-normalization.test.ts', minTests: 10 },
  { suiteName: 'test/postgres17-refresh.test.ts', minTests: 7 },
  { suiteName: 'test/rbac-http.test.ts', minTests: 11 },
  { suiteName: 'test/rbac-project-access.test.ts', minTests: 21 },
  { suiteName: 'test/redis-readiness.test.ts', minTests: 2 },
  { suiteName: 'test/refresh-session.test.ts', minTests: 21 },
  { suiteName: 'test/security-architect/internal-hitl.test.ts', minTests: 6 },
  { suiteName: 'test/security-architect/sec01-guards.test.ts', minTests: 8 },
  { suiteName: 'test/security-guard-order.test.ts', minTests: 9 },
  { suiteName: 'test/seed-normatives.test.ts', minTests: 5 },
  { suiteName: 'test/v03-integration.test.ts', minTests: 6 },
  { suiteName: 'test/v09-integration.test.ts', minTests: 2 },
]);

/** Обратная совместимость: имена обязательных suite. */
export const REQUIRED_SUITES = Object.freeze(SUITE_MANIFEST.map((entry) => entry.suiteName));

const ATTR = '@_';
const ALLOWED_ENTITIES = new Set(['amp', 'lt', 'gt', 'apos', 'quot']);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false,
  htmlEntities: false,
});

function integerAttribute(node, name, problems, label, required = false) {
  const raw = node?.[`${ATTR}${name}`];
  if (raw === undefined) {
    if (required) {
      problems.push(`${label}: отсутствует атрибут ${name}`);
    }
    return 0;
  }
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    problems.push(`${label}: атрибут ${name} не является целым числом`);
    return 0;
  }
  return Number(text);
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function directTagCount(node, tag) {
  if (node === null || node === undefined || typeof node !== 'object') {
    return 0;
  }
  const value = node[tag];
  if (value === undefined) {
    return 0;
  }
  return Array.isArray(value) ? value.length : 1;
}

function checkEntities(xml, problems) {
  if (/<!DOCTYPE\b/i.test(xml)) {
    problems.push('DOCTYPE/external entity запрещены');
    return;
  }
  for (const match of xml.matchAll(/&([^;\s<]+);/g)) {
    const token = match[1] ?? '';
    const numeric = /^#[0-9]+$/.test(token) || /^#x[0-9a-f]+$/i.test(token);
    if (!numeric && !ALLOWED_ENTITIES.has(token)) {
      problems.push(`неопределённая XML entity: &${token};`);
    }
  }
  // Одиночный '&' без ';' — тоже некорректная entity.
  if (/&(?!#\d+;|#x[0-9a-f]+;|amp;|lt;|gt;|apos;|quot;)/i.test(xml)) {
    problems.push('некорректная XML entity');
  }
}

function testcaseResultTags(testcase, tag) {
  return directTagCount(testcase, tag);
}

function testcaseSkippedFlag(testcase, label, problems) {
  const raw = testcase?.[`${ATTR}skipped`];
  const tags = testcaseResultTags(testcase, 'skipped');
  if (raw === undefined) {
    if (tags !== 0) {
      problems.push(`${label}: <skipped/> без атрибута skipped`);
    }
    return 0;
  }
  const text = String(raw).trim();
  if (text !== '0' && text !== '1') {
    problems.push(`${label}: атрибут skipped должен быть 0 или 1`);
    return 0;
  }
  const flag = Number(text);
  if (flag !== tags) {
    problems.push(`${label}: skipped="${flag}" не согласован с <skipped>=${tags}`);
  }
  return tags;
}

/**
 * Проверяет JUnit-файл.
 * @param {string} file — путь к XML.
 * @returns {{ok: boolean, problems: string[], summary: Record<string, number|undefined>}}
 */
export function verifyJUnit(file) {
  const problems = [];
  const summary = { tests: undefined, failures: undefined, errors: undefined, skipped: 0, suites: 0 };

  if (typeof file !== 'string' || file.length === 0) {
    return { ok: false, problems: ['не задан путь к JUnit'], summary };
  }
  if (!existsSync(file)) {
    return { ok: false, problems: [`файл не найден: ${file}`], summary };
  }

  let xml;
  let parsed;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) {
      return { ok: false, problems: ['JUnit путь не является файлом'], summary };
    }
    xml = readFileSync(file, 'utf8');
  } catch (error) {
    return {
      ok: false,
      problems: [`ошибка чтения JUnit: ${error instanceof Error ? error.message : String(error)}`],
      summary,
    };
  }

  if (xml.trim().length === 0) {
    return { ok: false, problems: ['JUnit-файл пуст'], summary };
  }

  try {
    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
      return { ok: false, problems: [`malformed XML: ${JSON.stringify(validation.err)}`], summary };
    }
    checkEntities(xml, problems);
    if (problems.length > 0) {
      return { ok: false, problems, summary };
    }
    parsed = parser.parse(xml);
  } catch (error) {
    return {
      ok: false,
      problems: [`ошибка разбора XML: ${error instanceof Error ? error.message : String(error)}`],
      summary,
    };
  }

  const root = parsed.testsuites;
  if (root === undefined || root === null || typeof root !== 'object' || Array.isArray(root)) {
    return { ok: false, problems: ['отсутствует корневой элемент <testsuites>'], summary };
  }

  const rootTests = integerAttribute(root, 'tests', problems, 'root', true);
  const rootFailures = integerAttribute(root, 'failures', problems, 'root', true);
  const rootErrors = integerAttribute(root, 'errors', problems, 'root', true);
  const rootSkipped = integerAttribute(root, 'skipped', problems, 'root', false);
  summary.tests = rootTests;
  summary.failures = rootFailures;
  summary.errors = rootErrors;

  const suites = asArray(root.testsuite);
  summary.suites = suites.length;
  if (suites.length === 0) {
    problems.push('root не содержит ни одного <testsuite>');
  }

  const byName = new Map();
  for (const suite of suites) {
    const name = String(suite?.[`${ATTR}name`] ?? '');
    if (name.length === 0) {
      problems.push('<testsuite> без атрибута name');
      continue;
    }
    if (byName.has(name)) {
      problems.push(`дублирующийся suite: ${name}`);
    }
    byName.set(name, suite);
  }

  for (const entry of SUITE_MANIFEST) {
    if (!byName.has(entry.suiteName)) {
      problems.push(`отсутствует обязательный suite: ${entry.suiteName}`);
    }
  }

  let sumTests = 0;
  let sumFailures = 0;
  let sumErrors = 0;
  let sumSkippedAttrs = 0;
  let totalCases = 0;
  let totalFailureTags = 0;
  let totalErrorTags = 0;
  let totalSkippedTags = 0;

  for (const suite of suites) {
    const name = String(suite?.[`${ATTR}name`] ?? 'unknown');
    const suiteTests = integerAttribute(suite, 'tests', problems, name, true);
    const suiteFailures = integerAttribute(suite, 'failures', problems, name, false);
    const suiteErrors = integerAttribute(suite, 'errors', problems, name, false);
    const suiteSkipped = integerAttribute(suite, 'skipped', problems, name, false);

    const cases = asArray(suite.testcase);
    let suiteFailureTags = 0;
    let suiteErrorTags = 0;
    let suiteSkippedTags = 0;

    for (const [index, testcase] of cases.entries()) {
      const label = `${name} testcase #${index + 1}`;
      const caseName = String(testcase?.[`${ATTR}name`] ?? '');
      if (caseName.trim().length === 0) {
        problems.push(`${label}: пустое имя testcase`);
      }
      suiteFailureTags += testcaseResultTags(testcase, 'failure');
      suiteErrorTags += testcaseResultTags(testcase, 'error');
      suiteSkippedTags += testcaseSkippedFlag(testcase, label, problems);
    }

    if (cases.length !== suiteTests) {
      problems.push(`${name}: testcase=${cases.length} != tests=${suiteTests}`);
    }
    if (suiteFailureTags !== suiteFailures) {
      problems.push(`${name}: <failure>=${suiteFailureTags} != failures=${suiteFailures}`);
    }
    if (suiteErrorTags !== suiteErrors) {
      problems.push(`${name}: <error>=${suiteErrorTags} != errors=${suiteErrors}`);
    }
    if (suiteSkippedTags !== suiteSkipped) {
      problems.push(`${name}: <skipped>=${suiteSkippedTags} != skipped=${suiteSkipped}`);
    }

    const manifestEntry = SUITE_MANIFEST.find((entry) => entry.suiteName === name);
    if (manifestEntry !== undefined) {
      if (cases.length < manifestEntry.minTests) {
        problems.push(`${name}: testcase=${cases.length} < minTests=${manifestEntry.minTests}`);
      }
      if (suiteTests < manifestEntry.minTests) {
        problems.push(`${name}: tests=${suiteTests} < minTests=${manifestEntry.minTests}`);
      }
    }

    sumTests += suiteTests;
    sumFailures += suiteFailures;
    sumErrors += suiteErrors;
    sumSkippedAttrs += suiteSkipped;
    totalCases += cases.length;
    totalFailureTags += suiteFailureTags;
    totalErrorTags += suiteErrorTags;
    totalSkippedTags += suiteSkippedTags;
  }

  summary.skipped = totalSkippedTags;

  if (rootTests === 0) {
    problems.push('root tests=0');
  }
  if (sumTests !== rootTests) {
    problems.push(`sum(suite.tests)=${sumTests} != root.tests=${rootTests}`);
  }
  if (totalCases !== rootTests) {
    problems.push(`testcase count=${totalCases} != root.tests=${rootTests}`);
  }
  if (sumFailures !== rootFailures || totalFailureTags !== rootFailures) {
    problems.push(`failures: suites=${sumFailures}, tags=${totalFailureTags}, root=${rootFailures}`);
  }
  if (sumErrors !== rootErrors || totalErrorTags !== rootErrors) {
    problems.push(`errors: suites=${sumErrors}, tags=${totalErrorTags}, root=${rootErrors}`);
  }
  if (sumSkippedAttrs !== totalSkippedTags || rootSkipped !== totalSkippedTags) {
    problems.push(`skipped: suites=${sumSkippedAttrs}, tags=${totalSkippedTags}, root=${rootSkipped}`);
  }
  if (rootFailures !== 0) {
    problems.push(`failures=${rootFailures}`);
  }
  if (rootErrors !== 0) {
    problems.push(`errors=${rootErrors}`);
  }
  if (totalSkippedTags !== 0) {
    problems.push(`skipped=${totalSkippedTags}`);
  }

  return { ok: problems.length === 0, problems, summary };
}

function main() {
  const file = process.argv[2];
  const result = verifyJUnit(file);
  console.log(
    `JUnit ${file ?? '<missing>'}: tests=${result.summary.tests ?? 0} failures=${result.summary.failures ?? 0} errors=${result.summary.errors ?? 0} skipped=${result.summary.skipped ?? 0} suites=${result.summary.suites ?? 0}`,
  );
  if (!result.ok) {
    console.error(`CI JUnit gate FAILED: ${result.problems.join('; ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('CI JUnit gate PASSED');
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main();
}
