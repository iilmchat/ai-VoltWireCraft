// © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.1
/** Регрессионные тесты CI JUnit gate: негативные сценарии не портят реальный artifact. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SUITE_MANIFEST, REQUIRED_SUITES, verifyJUnit } from './assert-ci-junit.mjs';

const dir = mkdtempSync(join(tmpdir(), 'vwc-junit-gate-'));
const subdir = join(dir, 'a-directory');
mkdirSync(subdir);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name, content) {
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

/**
 * Генерирует согласованный JUnit по manifest (baseline 215 testcase), затем мутации.
 * @param {object} options — мутации.
 * @returns {string} XML.
 */
function makeXml(options = {}) {
  const {
    omit = [],
    zeroSuite,
    reduceSuite,
    increaseSuite,
    skippedTagIn,
    skippedAttrIn,
    caseSkippedAttrIn,
    caseSkippedTagIn,
    caseSkippedTagWithZeroAttrIn,
    failureIn,
    errorIn,
    rootTestsOverride,
    truncated = false,
    rootFailures = 0,
    rootErrors = 0,
    emptyCaseNameIn,
    systemOutIn,
    entity,
    doctype = false,
  } = options;

  const specs = SUITE_MANIFEST.filter((entry) => !omit.includes(entry.suiteName)).map((entry) => ({
    name: entry.suiteName,
    tests: entry.minTests,
  }));
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
      let count = spec.tests;
      if (zeroSuite === spec.name) count = 0;
      if (reduceSuite === spec.name) count = Math.max(0, count - 1);
      if (increaseSuite === spec.name) count += 1;
      total += count;

      const cases = Array.from({ length: count }, (_, index) => {
        const name = emptyCaseNameIn === spec.name && index === 0 ? '' : `t${index}`;
        const skippedTag =
          (skippedTagIn === spec.name && index === 0) ||
          (caseSkippedTagIn === spec.name && index === 0) ||
          (caseSkippedTagWithZeroAttrIn === spec.name && index === 0);
        const failure = failureIn === spec.name && index === 0;
        const error = errorIn === spec.name && index === 0;
        const caseAttr =
          caseSkippedAttrIn === spec.name && index === 0
            ? ' skipped="1"'
            : caseSkippedTagWithZeroAttrIn === spec.name && index === 0
              ? ' skipped="0"'
              : '';
        const inner = skippedTag ? '<skipped/>' : failure ? '<failure message="x"/>' : error ? '<error message="x"/>' : '';
        const systemOut = systemOutIn === spec.name && index === 0
          ? '<system-out><skipped/>&amp;note</system-out>'
          : '';
        if (inner.length > 0 || systemOut.length > 0) {
          return `<testcase name="${name}" classname="C" time="0.01"${caseAttr}>${inner}${systemOut}</testcase>`;
        }
        return `<testcase name="${name}" classname="C" time="0.01"${caseAttr}/>`;
      });

      const skippedAttr = skippedAttrIn === spec.name ? 1 : 0;
      return `<testsuite name="${spec.name}" tests="${count}" failures="0" errors="0" skipped="${skippedAttr}">${cases.join('')}</testsuite>`;
    })
    .join('');

  const tests = rootTestsOverride ?? total;
  const prefix = doctype
    ? '<!DOCTYPE testsuites [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
    : '';
  const body = entity === 'nbsp' ? '&nbsp;' : '';
  return `${prefix}<testsuites name="vitest tests${body}" tests="${tests}" failures="${rootFailures}" errors="${rootErrors}">${suiteXml}</testsuites>`;
}

describe('CI JUnit gate (strict parser + minTests)', () => {
  it('valid full JUnit (215/0/0) — PASS', () => {
    const file = write('valid.xml', makeXml());
    const result = verifyJUnit(file);
    expect(result.ok).toBe(true);
    expect(result.summary.tests).toBe(215);
    expect(result.summary.suites).toBe(REQUIRED_SUITES.length);
  });

  it('correct full JUnit with 0 skipped — PASS', () => {
    const file = write('zero-skipped.xml', makeXml());
    const result = verifyJUnit(file);
    expect(result.ok).toBe(true);
    expect(result.summary.skipped).toBe(0);
  });

  it('exact minimum count — PASS', () => {
    expect(verifyJUnit(write('exact-min.xml', makeXml())).ok).toBe(true);
  });

  it('increased count — PASS', () => {
    const file = write('increased.xml', makeXml({ increaseSuite: 'test/agents.test.ts' }));
    expect(verifyJUnit(file).ok).toBe(true);
  });

  it('missing file — FAIL', () => {
    expect(verifyJUnit(join(dir, 'missing.xml')).ok).toBe(false);
  });

  it('file read error (directory) — FAIL controlled', () => {
    expect(verifyJUnit(subdir).ok).toBe(false);
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

  it('empty required suite with consistent root totals — FAIL', () => {
    const file = write('empty-suite.xml', makeXml({ zeroSuite: 'test/agents.test.ts' }));
    const result = verifyJUnit(file);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/minTests/);
  });

  it('partial suite loss below minTests with consistent totals — FAIL', () => {
    const file = write('partial-suite.xml', makeXml({ reduceSuite: 'test/agents.test.ts' }));
    expect(verifyJUnit(file).ok).toBe(false);
  });

  it('testcase skipped="1" without tag — FAIL', () => {
    const file = write('case-skipped-attr.xml', makeXml({ caseSkippedAttrIn: 'test/agents.test.ts' }));
    expect(verifyJUnit(file).ok).toBe(false);
  });

  it('testcase skipped tag without attr — FAIL', () => {
    const file = write('case-skipped-tag.xml', makeXml({ caseSkippedTagIn: 'test/agents.test.ts' }));
    expect(verifyJUnit(file).ok).toBe(false);
  });

  it('testcase skipped tag with skipped="0" — FAIL', () => {
    const file = write(
      'case-skipped-zero-tag.xml',
      makeXml({ caseSkippedTagWithZeroAttrIn: 'test/agents.test.ts' }),
    );
    expect(verifyJUnit(file).ok).toBe(false);
  });

  it('testcase skipped="0" without tag — PASS', () => {
    const xml = makeXml().replace(
      '<testcase name="t0" classname="C" time="0.01"/>',
      '<testcase name="t0" classname="C" time="0.01" skipped="0"/>',
    );
    expect(verifyJUnit(write('case-skipped-zero-ok.xml', xml)).ok).toBe(true);
  });

  it('<system-out> containing skipped-like content does not create false failure', () => {
    const file = write('system-out.xml', makeXml({ systemOutIn: 'test/agents.test.ts' }));
    expect(verifyJUnit(file).ok).toBe(true);
  });

  it('undefined entity &nbsp; — FAIL', () => {
    expect(verifyJUnit(write('nbsp.xml', makeXml({ entity: 'nbsp' }))).ok).toBe(false);
  });

  it('DOCTYPE/external entity — FAIL', () => {
    expect(verifyJUnit(write('doctype.xml', makeXml({ doctype: true }))).ok).toBe(false);
  });

  it('tests=0 — FAIL', () => {
    expect(verifyJUnit(write('zero.xml', makeXml({ rootTestsOverride: 0 }))).ok).toBe(false);
  });

  it('mismatched root/suite totals — FAIL', () => {
    expect(verifyJUnit(write('mismatch.xml', makeXml({ rootTestsOverride: 999 }))).ok).toBe(false);
  });

  it('failures/errors — FAIL', () => {
    const withFailure = write('failure.xml', makeXml({ failureIn: 'test/agents.test.ts', rootFailures: 1 }));
    const withError = write('error.xml', makeXml({ errorIn: 'test/agents.test.ts', rootErrors: 1 }));
    expect(verifyJUnit(withFailure).ok).toBe(false);
    expect(verifyJUnit(withError).ok).toBe(false);
  });

  it('suite <skipped> tag and skipped="1" attribute — FAIL', () => {
    const tag = write('skipped-tag.xml', makeXml({ skippedTagIn: 'test/agents.test.ts' }));
    const attr = write(
      'skipped-attr.xml',
      makeXml({ skippedAttrIn: 'test/agents.test.ts', skippedTagIn: 'test/agents.test.ts' }),
    );
    expect(verifyJUnit(tag).ok).toBe(false);
    expect(verifyJUnit(attr).ok).toBe(false);
  });

  it('empty testcase name — FAIL', () => {
    const file = write('empty-name.xml', makeXml({ emptyCaseNameIn: 'test/agents.test.ts' }));
    expect(verifyJUnit(file).ok).toBe(false);
  });

  it('truncated XML with fake root totals — FAIL', () => {
    const file = write('truncated.xml', makeXml({ truncated: true, rootTestsOverride: 9 }));
    expect(verifyJUnit(file).ok).toBe(false);
  });
});
