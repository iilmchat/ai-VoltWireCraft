import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WORKFLOW = '.github/workflows/ci.yml';
const ROOT = mkdtempSync(join(tmpdir(), 'vwc-prod-calc-ci-'));
const BASH =
  ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'].find(
    (candidate) => existsSync(candidate),
  ) ?? 'bash';
const workflow = readFileSync(WORKFLOW, 'utf8');

afterAll(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // Временная директория может быть заблокирована процессом; на результат тестов не влияет.
  }
});

function stepBlock(name) {
  const lines = workflow.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(`name: ${name}`));
  expect(index, `step ${name} not found`).toBeGreaterThan(-1);
  let runIndex = index + 1;
  while (runIndex < lines.length && !lines[runIndex].includes('run: |')) {
    runIndex += 1;
  }
  expect(runIndex, `run block for ${name} not found`).toBeLessThan(lines.length);
  const indent = /^\s*/.exec(lines[runIndex])[0].length;
  const body = [];
  for (let i = runIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    if (/^\s*/.exec(line)[0].length <= indent) {
      break;
    }
    body.push(line.slice(indent + 2));
  }
  return body.join('\n');
}

function bash(script, env = {}) {
  return spawnSync(BASH, ['-c', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, RUNNER_TEMP: ROOT, ...env },
  });
}

const LDD_STUB = `ldd() {
  case "$FAKE_LDD_MODE" in
    fail) return 1 ;;
    libplot) printf '%s\\n' 'libplot.so.2 => /usr/lib/libplot.so.2'; return 0 ;;
    unresolved) printf '%s\\n' 'libredwg.so.0 => not found'; return 0 ;;
    *) printf '%s\\n' 'libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6'; return 0 ;;
  esac
}
`;

function runtimeScript(prefix) {
  const block = stepBlock('Verify runtime dependencies of production image');
  const match = /-c '([\s\S]*?)'/.exec(block);
  expect(match, 'runtime sh -c payload not found').not.toBeNull();
  const posix = (value) => value.replace(/\\/g, '/');
  return (
    LDD_STUB +
    match[1]
      .replace(/\/usr\/local\/bin\/dwg2dxf/g, posix(join(prefix, 'dwg2dxf')))
      .replace(/\/usr\/local\/bin\/dxf2dwg/g, posix(join(prefix, 'dxf2dwg')))
      .replace(/\/usr\/local\/lib\/libredwg\.so\.0/g, posix(join(prefix, 'libredwg.so.0')))
      .replace(/\/usr\/local\/bin\/dwgplot/g, posix(join(prefix, 'dwgplot')))
  );
}

function filledPrefix() {
  const prefix = join(ROOT, 'runtime');
  mkdirSync(prefix, { recursive: true });
  for (const name of ['dwg2dxf', 'dxf2dwg', 'libredwg.so.0']) {
    writeFileSync(join(prefix, name), 'binary\n', 'utf8');
  }
  return prefix;
}

describe('prod-calc-build CI logic (E-1…E-4)', () => {
  it('E1-01 workflow_dispatch is present and push/PR stay on main', () => {
    expect(workflow).toMatch(/^\s{2}workflow_dispatch:/m);
    expect(workflow).toMatch(/run_reason:/);
    expect(workflow).toMatch(/branches: \[main\]/);
    expect(workflow).not.toMatch(/branches: \[wave1-/);
    expect(workflow).toContain('prod-calc-build:');
  });

  it('E2-01 build step fails on non-zero build command', () => {
    const block = stepBlock('Build production calc-engine image (clean, no CI override)');
    expect(block).toContain('set -euo pipefail');
    expect(block).toContain('docker compose build --pull --no-cache calc-engine');
    expect(block).not.toContain('|| true');
    const negative = `${block.replace(
      'docker compose build --pull --no-cache calc-engine',
      'false',
    )}\necho AFTER_FAILED_BUILD\n`;
    const result = bash(negative);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('AFTER_FAILED_BUILD');
  });

  it('E2-02 build log upload is always() and cannot mask build failure', () => {
    expect(workflow).toMatch(/if: always\(\)\s*\n\s*uses: actions\/upload-artifact@v4/);
    expect(workflow).not.toContain('continue-on-error');
  });

  it('E3-01 ldd exit code != 0 fails', () => {
    const result = bash(runtimeScript(filledPrefix()), { FAKE_LDD_MODE: 'fail' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ldd failed');
  });

  it('E3-02 missing runtime binary fails', () => {
    const prefix = filledPrefix();
    rmSync(join(prefix, 'dxf2dwg'));
    const result = bash(runtimeScript(prefix), { FAKE_LDD_MODE: 'clean' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing runtime binary');
  });

  it('E3-03 libplot in runtime fails', () => {
    const result = bash(runtimeScript(filledPrefix()), { FAKE_LDD_MODE: 'libplot' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('forbidden build-only dependency');
  });

  it('E3-04 unresolved shared library fails', () => {
    const result = bash(runtimeScript(filledPrefix()), { FAKE_LDD_MODE: 'unresolved' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unresolved dependency');
  });

  it('E3-05 clean runtime dependency set passes', () => {
    const result = bash(runtimeScript(filledPrefix()), { FAKE_LDD_MODE: 'clean' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('runtime dependency checks passed');
  });

  it('E4-01 health smoke uses production Compose and has always() cleanup', () => {
    const block = stepBlock('Runtime health smoke via production Compose');
    expect(block).toContain('docker compose up -d --no-build calc-engine');
    expect(block).toContain('http://localhost:${CALC_ENGINE_PORT}/health');
    expect(block).toContain('$(seq 1 60)');
    expect(block).not.toContain('docker run -d');
    expect(workflow).toContain('name: Cleanup production Compose smoke');
    expect(workflow).toMatch(/name: Cleanup production Compose smoke\s*\n\s*if: always\(\)/);
    expect(workflow).toContain('docker compose down --remove-orphans');
  });
});
