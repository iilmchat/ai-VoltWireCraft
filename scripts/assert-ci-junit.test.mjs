// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Регрессионные тесты CI JUnit gate: негативные сценарии не портят реальный artifact. */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { REQUIRED_SUITES, verifyJUnit } from './assert-ci-junit.mjs';

const dir = mkdtempSync(join(tmpdir(), 'vwc-junit-gate-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name, content) {
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

function suiteSpec(name) {
  if (name.endsWith('postgres17-refresh.test.ts')) {
    return { name, tests: 7 };
  }
  if (name.endsWith('redis-readiness.test.ts')) {
    return { name, tests: 2 };
  }
  return { name, tests: 1 };
}

/**
 * Генерирует согласованный JUnit, затем применяет точечные мутации.
 * @param {object} options — мутации.
 * @returns {string} XML.
 */
function makeXml(options = {}) {
  const {
    omit = [],
    skippedTagIn,
    skippedAttrIn,
    failureIn,
    errorIn,
    rootTestsOverride,
    truncated = false,
    rootFailures = 0,
    rootErrors = 0,
  } = options;

  const specs = REQUIRED_SUITES.filter((name) => !omit.includes(name)).map(suiteSpec);
  const active = truncated
    ? specs.filter(
        (spec) =>
          spec.name.endsWith('postgres17-refresh.test.ts') ||
          spec.name.endsWith('redis-readiness.test.ts'),
      )
    : specs;

  let total = 0;
  const suiteXml = active
    .map((spec) => {
      total += spec.tests;
      const cases = Array.from({ length: spec.tests }, (_, index) => {
        const skipped = skippedTagIn === spec.name && index === 0;
        const failure = failureIn === spec.name && index === 0;
        const error = errorIn === spec.name && index === 0;
        const inner = skipped ? '<skipped/>' : failure ? '<failure message="x"/>' : error ? '<error message="x"/>' : '';
        return inner.length > 0
          ? `<testcase name="t${index}" classname="C" time="0.01">${inner}</testcase>`
          : `<testcase name="t${index}" classname="C" time="0.01"/>`;
      });
      const skippedAttr = skippedAttrIn === spec.name ? 1 : 0;
      return `<testsuite name="${spec.name}" tests="${spec.tests}" failures="0" errors="0" skipped="${skippedAttr}">${cases.join('')}</testsuite>`;
    })
    .join('');

  const tests = rootTestsOverride ?? total;
  return `<testsuites name="vitest tests" tests="${tests}" failures="${rootFailures}" errors="${rootErrors}">${suiteXml}</testsuites>`;
}

describe('CI JUnit gate (strict parser)', () => {
  it('valid full JUnit — PASS', () => {
    const file = write('valid.xml', makeXml());
    expect(verifyJUnit(file).ok).toBe(true);
  });

  it('correct full JUnit with 0 skipped — PASS', () => {
    const file = write('zero-skipped.xml', makeXml());
    const result = verifyJUnit(file);
    expect(result.ok).toBe(true);
    expect(result.summary.skipped).toBe(0);
    expect(result.summary.suites).toBe(REQUIRED_SUITES.length);
  });

  it('missing file — FAIL', () => {
    expect(verifyJUnit(join(dir, 'missing.xml')).ok).toBe(false);
  });

  it('empty file — FAIL', () => {
    expect(verifyJUnit(write('empty.xml', '')).ok).toBe(false);
  });

  it('malformed/unclosed XML — FAIL', () => {
    const file = write(
      'malformed.xml',
      '<testsuites name="vitest tests" tests="9" failures="0" errors="0"><testsuite name="test/postgres17-refresh.test.ts" tests="7"><testcase name="a"/><testsuite name="test/redis-readiness.test.ts" tests="2">',
    );
    expect(verifyJUnit(file).ok).toBe(false);
  });

  it('missing root <testsuites> — FAIL', () => {
    expect(verifyJUnit(write('no-root.xml', '<html><body/></html>')).ok).toBe(false);
  });

  it('missing PostgreSQL suite — FAIL', () => {
    const file = write('no-pg.xml', makeXml({ omit: ['test/postgres17-refresh.test.ts'] }));
    expect(verifyJUnit(file).ok).toBe(false);
  });

  it('missing Redis suite — FAIL', () => {
    const file = write('no-redis.xml', makeXml({ omit: ['test/redis-readiness.test.ts'] }));
    expect(verifyJUnit(file).ok).toBe(false);
  });

  it('missing any other mandatory suite — FAIL', () => {
    const file = write('no-agents.xml', makeXml({ omit: ['test/agents.test.ts'] }));
    expect(verifyJUnit(file).ok).toBe(false);
  });

  it('tests=0 — FAIL', () => {
    expect(verifyJUnit(write('zero.xml', makeXml({ rootTestsOverride: 0 }))).ok).toBe(false);
  });

  it('mismatched root/suite totals — FAIL', () => {
    expect(verifyJUnit(write('mismatch.xml', makeXml({ rootTestsOverride: 999 }))).ok).toBe(false);
  });

  it('failures/errors — FAIL', () => {
    const withFailure = write(
      'failure.xml',
      makeXml({ failureIn: 'test/agents.test.ts', rootFailures: 1 }),
    );
    const withError = write('error.xml', makeXml({ errorIn: 'test/agents.test.ts', rootErrors: 1 }));
    expect(verifyJUnit(withFailure).ok).toBe(false);
    expect(verifyJUnit(withError).ok).toBe(false);
  });

  it('<skipped> tag in any suite — FAIL', () => {
    const file = write('skipped-tag.xml', makeXml({ skippedTagIn: 'test/agents.test.ts' }));
    expect(verifyJUnit(file).ok).toBe(false);
  });

  it('skipped="1" attribute in any suite — FAIL', () => {
    const file = write(
      'skipped-attr.xml',
      makeXml({ skippedAttrIn: 'test/agents.test.ts', skippedTagIn: 'test/agents.test.ts' }),
    );
    expect(verifyJUnit(file).ok).toBe(false);
  });

  it('truncated XML with fake root totals — FAIL', () => {
    const file = write('truncated.xml', makeXml({ truncated: true, rootTestsOverride: 9 }));
    expect(verifyJUnit(file).ok).toBe(false);
  });
});
