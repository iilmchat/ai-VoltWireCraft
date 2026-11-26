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

const EXTRA_ROOTS = [];

/** Изолированный репозиторий для регрессий D-1…D-4. */
function makeRepo(label) {
  const root = mkdtempSync(join(tmpdir(), `vwc-${label}-`));
  EXTRA_ROOTS.push(root);
  const repo = join(root, 'repo');
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const g = (args) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  g(['config', 'user.email', 'd@example.invalid']);
  g(['config', 'user.name', 'D Test']);
  const commit = (message) => {
    g(['add', '-A']);
    g(['commit', '-q', '-m', message]);
    return g(['rev-parse', 'HEAD']);
  };
  const event = (name, payload) => {
    const path = join(root, `event-${name}.json`);
    writeFileSync(path, JSON.stringify(payload), 'utf8');
    return path;
  };
  const scan = ({ eventPath, eventName, args = [] }) =>
    spawnSync(process.execPath, [SCANNER, ...args], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_PATH: eventPath ?? '',
        GITHUB_EVENT_NAME: eventName ?? '',
      },
    });
  // Базовый отслеживаемый файл: full-tree fallback всегда имеет что сканировать.
  writeFileSync(join(repo, 'README.md'), 'clean repository\n', 'utf8');
  const baseSha = commit('base');
  return { root, repo, g, commit, baseSha, event, scan };
}

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  for (const root of EXTRA_ROOTS) {
    rmSync(root, { recursive: true, force: true });
  }
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

  it('D1-01 push deleting a file is not a false FAIL', () => {
    const { repo, g, commit, event, scan } = makeRepo('d1-push-delete');
    writeFileSync(join(repo, 'tobedeleted.txt'), 'clean\n', 'utf8');
    const base = commit('add file');
    g(['rm', '-q', 'tobedeleted.txt']);
    const head = commit('delete file');
    const result = scan({ eventPath: event('push', { before: base, after: head }), eventName: 'push' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('удалённые файлы');
    expect(result.stderr).not.toContain('ENOENT');
  });

  it('D1-02 pull_request deleting a file is not a false FAIL', () => {
    const { repo, g, commit, event, scan } = makeRepo('d1-pr-delete');
    writeFileSync(join(repo, 'tobedeleted.txt'), 'clean\n', 'utf8');
    const base = commit('add file');
    g(['rm', '-q', 'tobedeleted.txt']);
    const head = commit('delete file');
    const result = scan({
      eventPath: event('pr', { pull_request: { base: { sha: base }, head: { sha: head } } }),
      eventName: 'pull_request',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('удалённые файлы');
  });

  it('D1-03 unreadable file present in head still FAILS', () => {
    const { repo, commit, baseSha: base, event, scan } = makeRepo('d1-read-error');
    writeFileSync(join(repo, 'missing.txt'), 'clean\n', 'utf8');
    const head = commit('add file');
    rmSync(join(repo, 'missing.txt'));
    const result = scan({
      eventPath: event('pr', { pull_request: { base: { sha: base }, head: { sha: head } } }),
      eventName: 'pull_request',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('не удалось прочитать');
  });

  it('D1-04 rename is handled via add+delete semantics', () => {
    const { repo, g, commit, event, scan } = makeRepo('d1-rename');
    writeFileSync(join(repo, 'old.txt'), 'clean\n', 'utf8');
    const base = commit('base');
    g(['mv', 'old.txt', 'new.txt']);
    const head = commit('rename');
    const result = scan({ eventPath: event('push', { before: base, after: head }), eventName: 'push' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('mode=event-diff');
    expect(result.stdout).toContain('scanned=1');
  });

  it('D2-01 explicit mode with only excluded paths is a valid no-op', () => {
    const { repo, scan } = makeRepo('d2-explicit');
    writeFileSync(join(repo, '.env.example'), 'clean\n', 'utf8');
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    writeFileSync(join(repo, 'scripts', 'check-secrets.mjs'), 'clean\n', 'utf8');
    const result = scan({ args: ['.env.example', 'scripts/check-secrets.mjs'] });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('candidates=0');
  });

  it('D2-02 unreadable event data falls back to full-tree scan', () => {
    const { root, scan } = makeRepo('d2-diff-error');
    const result = scan({ eventPath: join(root, 'missing-event.json'), eventName: 'push' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('mode=full-tree');
    expect(result.stdout).toMatch(/scanned=[1-9]\d*/);
  });

  it('D3-01 binary file with synthetic secret is detected', () => {
    const { repo, commit, baseSha: base, event, scan } = makeRepo('d3-binary-secret');
    writeFileSync(
      join(repo, 'payload.bin'),
      Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(SECRET_ASSIGNMENT, 'utf8'), Buffer.from([0])]),
    );
    const head = commit('binary');
    const result = scan({ eventPath: event('push', { before: base, after: head }), eventName: 'push' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('жёстко заданный секрет');
    expect(result.stdout + result.stderr).not.toContain(SYNTHETIC_SECRET);
  });

  it('D3-02 ordinary binary file causes no mass false positive', () => {
    const { repo, commit, baseSha: base, event, scan } = makeRepo('d3-binary-clean');
    writeFileSync(join(repo, 'image.bin'), Buffer.from([0, 1, 2, 255, 0]));
    const head = commit('binary');
    const result = scan({ eventPath: event('push', { before: base, after: head }), eventName: 'push' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('binary=1');
  });

  it('D3-03 scanner logs never disclose the synthetic secret', () => {
    const { repo, commit, baseSha: base, event, scan } = makeRepo('d3-log');
    writeFileSync(
      join(repo, 'payload.bin'),
      Buffer.concat([Buffer.from([0]), Buffer.from(SECRET_ASSIGNMENT, 'utf8')]),
    );
    const head = commit('binary');
    const result = scan({ eventPath: event('push', { before: base, after: head }), eventName: 'push' });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(SYNTHETIC_SECRET);
  });

  it('D4-01 exact allowed .env.example path is excluded', () => {
    const { repo, commit, scan } = makeRepo('d4-allowed');
    writeFileSync(join(repo, '.env.example'), SECRET_ASSIGNMENT, 'utf8');
    commit('add env example');
    const result = scan({});
    expect(result.status, result.stderr).toBe(0);
  });

  it('D4-02 same basename in another directory is scanned', () => {
    const { repo, commit, scan } = makeRepo('d4-basename');
    mkdirSync(join(repo, 'nested'), { recursive: true });
    writeFileSync(join(repo, 'nested', '.env.example'), SECRET_ASSIGNMENT, 'utf8');
    commit('add nested env example');
    const result = scan({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nested/.env.example');
  });

  it('D4-03 arbitrary check-secrets.mjs is scanned', () => {
    const { repo, commit, scan } = makeRepo('d4-scanner-name');
    mkdirSync(join(repo, 'nested'), { recursive: true });
    writeFileSync(join(repo, 'nested', 'check-secrets.mjs'), SECRET_ASSIGNMENT, 'utf8');
    commit('add nested scanner name');
    const result = scan({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nested/check-secrets.mjs');
  });
});
