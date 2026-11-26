import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCANNER = resolve(HERE, 'check-secrets.mjs');
const ROOT = mkdtempSync(join(tmpdir(), 'vwc-g14-'));
const REPO = join(ROOT, 'repo');

/** Синтетический секрет собран динамически, чтобы сам тест не содержал паттерн. */
const SYNTHETIC_SECRET = 'gh' + 'p_' + 'A'.repeat(24);
// Строка собирается из частей, чтобы сам тестовый файл не содержал секрет-паттерн.
const SECRET_ASSIGNMENT = ['to', 'ken', ' = ', '"', SYNTHETIC_SECRET, '"'].join('');

function git(args) {
  return execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function commit(message) {
  git(['add', '-A']);
  git(['commit', '-q', '-m', message]);
  return git(['rev-parse', 'HEAD']);
}

function writeEvent(name, payload) {
  const path = join(ROOT, `event-${name}.json`);
  writeFileSync(path, JSON.stringify(payload), 'utf8');
  return path;
}

function runScanner({ eventPath, eventName, args = [] }) {
  return spawnSync(process.execPath, [SCANNER, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_PATH: eventPath ?? '',
      GITHUB_EVENT_NAME: eventName ?? '',
    },
  });
}

let baseSha;
let headSha;
let secretSha;

beforeAll(() => {
  mkdirSync(REPO, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: REPO });
  git(['config', 'user.email', 'g14@example.invalid']);
  git(['config', 'user.name', 'G14 Test']);

  writeFileSync(join(REPO, 'README.md'), 'clean repository\n', 'utf8');
  baseSha = commit('base');

  writeFileSync(join(REPO, 'feature.txt'), 'clean changed file\n', 'utf8');
  headSha = commit('head');

  writeFileSync(join(REPO, 'leak.txt'), SECRET_ASSIGNMENT, 'utf8');
  secretSha = commit('secret');

  // Рабочее дерево снова чистое: полное сканирование проходит, а diff до
  // secretSha по-прежнему содержит секрет и обязан завершаться FAIL.
  rmSync(join(REPO, 'leak.txt'));
  commit('remove synthetic secret');
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe('G-14 fail-closed secret scan', () => {
  it('G14-01 push scans actual changed files', () => {
    const event = writeEvent('push', { before: baseSha, after: headSha });
    const result = runScanner({ eventPath: event, eventName: 'push' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('mode=event-diff');
    expect(result.stdout).toMatch(/scanned=[1-9]\d*/);
  });

  it('G14-02 pull_request scans actual changed files', () => {
    const event = writeEvent('pr', {
      pull_request: { base: { sha: baseSha }, head: { sha: headSha } },
    });
    const result = runScanner({ eventPath: event, eventName: 'pull_request' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('mode=event-diff');
    expect(result.stdout).toContain('scanned=1');
  });

  it('G14-03 PR containing a synthetic secret FAILS without disclosing it', () => {
    const event = writeEvent('pr-secret', {
      pull_request: { base: { sha: headSha }, head: { sha: secretSha } },
    });
    writeFileSync(join(REPO, 'leak.txt'), SECRET_ASSIGNMENT, 'utf8');
    try {
      const result = runScanner({ eventPath: event, eventName: 'pull_request' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('leak.txt');
      expect(result.stderr).toContain('жёстко заданный секрет');
      expect(result.stdout + result.stderr).not.toContain(SYNTHETIC_SECRET);
    } finally {
      rmSync(join(REPO, 'leak.txt'), { force: true });
    }
  });

  it('G14-04 empty diff falls back to full-tree scan, never false PASS', () => {
    const event = writeEvent('empty', { before: baseSha, after: baseSha });
    const result = runScanner({ eventPath: event, eventName: 'push' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('mode=full-tree');
    expect(result.stdout).toMatch(/scanned=[1-9]\d*/);
  });

  it('G14-05 missing/invalid SHA never produces false PASS', () => {
    const event = writeEvent('bad-sha', {
      pull_request: {
        base: { sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' },
        head: { sha: secretSha },
      },
    });
    const result = runScanner({ eventPath: event, eventName: 'pull_request' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('mode=full-tree');
    expect(result.stdout).toContain('commit отсутствует');
    expect(result.stdout).toMatch(/scanned=[1-9]\d*/);
  });

  it('G14-06 scanner execution error fails closed', () => {
    const event = writeEvent('ok', { before: baseSha, after: headSha });
    const result = runScanner({ eventPath: event, eventName: 'push', args: [REPO] });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('не удалось прочитать');
  });

  it('G14-07 normal PR without secrets succeeds', () => {
    const event = writeEvent('normal', {
      pull_request: { base: { sha: baseSha }, head: { sha: headSha } },
    });
    const result = runScanner({ eventPath: event, eventName: 'pull_request' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('scanned=1');
  });

  it('G14-08 logs contain no secret values', () => {
    const event = writeEvent('log', {
      pull_request: { base: { sha: headSha }, head: { sha: secretSha } },
    });
    const result = runScanner({ eventPath: event, eventName: 'pull_request' });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(SYNTHETIC_SECRET);
  });
});
