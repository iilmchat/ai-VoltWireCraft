// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * CI gate: интеграционные тесты с реальными PostgreSQL 17 и Redis обязательны.
 * Использует строгую валидацию XML и разбор дерева (fast-xml-parser), а не regex.
 */

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

/** Обязательные suite из полного JUnit propagation-прогона. */
export const REQUIRED_SUITES = Object.freeze([
  'test/agents.test.ts',
  'test/app.bootstrap.test.ts',
  'test/assemble-panel-authorization.test.ts',
  'test/auth-rate-limit.test.ts',
  'test/auth.test.ts',
  'test/calc-engine.client.test.ts',
  'test/catalog-and-calculation.test.ts',
  'test/copilot-chat.test.ts',
  'test/env.schema.test.ts',
  'test/erp-hitl-integration.test.ts',
  'test/golden-dataset.test.ts',
  'test/health.controller.test.ts',
  'test/integrations.test.ts',
  'test/origin-normalization.test.ts',
  'test/postgres17-refresh.test.ts',
  'test/rbac-http.test.ts',
  'test/rbac-project-access.test.ts',
  'test/redis-readiness.test.ts',
  'test/refresh-session.test.ts',
  'test/security-architect/internal-hitl.test.ts',
  'test/security-architect/sec01-guards.test.ts',
  'test/security-guard-order.test.ts',
  'test/seed-normatives.test.ts',
  'test/v03-integration.test.ts',
  'test/v09-integration.test.ts',
]);

const ATTR = '@_';
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR,
  parseAttributeValue: false,
  trimValues: true,
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

function countTag(node, tag) {
  if (node === null || node === undefined || typeof node !== 'object') {
    return 0;
  }
  if (Array.isArray(node)) {
    return node.reduce((total, item) => total + countTag(item, tag), 0);
  }
  let count = Object.prototype.hasOwnProperty.call(node, tag) ? 1 : 0;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith(ATTR)) {
      continue;
    }
    count += countTag(value, tag);
  }
  return count;
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
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

  const xml = readFileSync(file, 'utf8');
  if (xml.trim().length === 0) {
    return { ok: false, problems: ['JUnit-файл пуст'], summary };
  }

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    return { ok: false, problems: [`malformed XML: ${JSON.stringify(validation.err)}`], summary };
  }

  const parsed = parser.parse(xml);
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
      problems.push('|<testsuite> без атрибута name');
      continue;
    }
    if (byName.has(name)) {
      problems.push(`дублирующийся suite: ${name}`);
    }
    byName.set(name, suite);
  }

  for (const required of REQUIRED_SUITES) {
    if (!byName.has(required)) {
      problems.push(`отсутствует обязательный suite: ${required}`);
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
    const suiteSkippedTags = countTag(suite, 'skipped');
    const suiteFailureTags = countTag(suite, 'failure');
    const suiteErrorTags = countTag(suite, 'error');

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

  const pgSuite = byName.get('test/postgres17-refresh.test.ts');
  const redisSuite = byName.get('test/redis-readiness.test.ts');
  if (pgSuite !== undefined) {
    const tests = integerAttribute(pgSuite, 'tests', problems, 'postgres17-refresh', true);
    const skipped = integerAttribute(pgSuite, 'skipped', problems, 'postgres17-refresh', false);
    if (tests < 7 || skipped !== 0 || countTag(pgSuite, 'skipped') !== 0) {
      problems.push(`PostgreSQL 17 suite: tests=${tests}, skipped=${skipped}`);
    }
  }
  if (redisSuite !== undefined) {
    const tests = integerAttribute(redisSuite, 'tests', problems, 'redis-readiness', true);
    const skipped = integerAttribute(redisSuite, 'skipped', problems, 'redis-readiness', false);
    if (tests < 2 || skipped !== 0 || countTag(redisSuite, 'skipped') !== 0) {
      problems.push(`Redis suite: tests=${tests}, skipped=${skipped}`);
    }
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
