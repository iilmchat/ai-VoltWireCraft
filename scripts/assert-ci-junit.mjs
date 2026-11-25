// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/**
 * CI gate: интеграционные тесты с реальными PostgreSQL 17 и Redis обязательны.
 * Отсутствие сервиса выражается как skipped — этот скрипт завершает job ошибкой.
 */

import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (file === undefined) {
  console.error('USAGE: node scripts/assert-ci-junit.mjs <junit.xml>');
  process.exit(1);
}

const xml = readFileSync(file, 'utf8');
const rootTag = xml.match(/<testsuites\b[^>]*>/)?.[0] ?? '';

function rootNumber(name) {
  const match = rootTag.match(new RegExp(`${name}="(\\d+)"`));
  return match === null ? 0 : Number(match[1]);
}

const tests = rootNumber('tests');
const failures = rootNumber('failures');
const errors = rootNumber('errors');
const skipped = (xml.match(/<skipped\b/g) ?? []).length;

const suites = [...xml.matchAll(/<testsuite\b([^>]*)>/g)].map((match) => {
  const attrs = match[1] ?? '';
  const name = attrs.match(/name="([^"]+)"/)?.[1] ?? '';
  const count = Number(attrs.match(/tests="(\d+)"/)?.[1] ?? 0);
  const suiteSkipped = Number(attrs.match(/skipped="(\d+)"/)?.[1] ?? 0);
  return { name, count, suiteSkipped };
});

const pgSuite = suites.find((suite) => suite.name.endsWith('postgres17-refresh.test.ts'));
const redisSuite = suites.find((suite) => suite.name.endsWith('redis-readiness.test.ts'));

const problems = [];
if (tests === 0) problems.push('JUnit не содержит тестов');
if (failures !== 0) problems.push(`failures=${failures}`);
if (errors !== 0) problems.push(`errors=${errors}`);
if (skipped !== 0) problems.push(`skipped=${skipped}`);
if (pgSuite === undefined) problems.push('отсутствует suite postgres17-refresh.test.ts');
else if (pgSuite.count < 7 || pgSuite.suiteSkipped !== 0) {
  problems.push(`PostgreSQL 17 suite: tests=${pgSuite.count}, skipped=${pgSuite.suiteSkipped}`);
}
if (redisSuite === undefined) problems.push('отсутствует suite redis-readiness.test.ts');
else if (redisSuite.count < 2 || redisSuite.suiteSkipped !== 0) {
  problems.push(`Redis suite: tests=${redisSuite.count}, skipped=${redisSuite.suiteSkipped}`);
}

console.log(`JUnit ${file}: tests=${tests} failures=${failures} errors=${errors} skipped=${skipped}`);
console.log(`PostgreSQL 17: ${pgSuite?.count ?? 0} tests; Redis readiness: ${redisSuite?.count ?? 0} tests`);

if (problems.length > 0) {
  console.error(`CI JUnit gate FAILED: ${problems.join('; ')}`);
  process.exit(1);
}
console.log('CI JUnit gate PASSED');
