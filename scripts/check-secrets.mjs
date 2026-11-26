import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * Проверка файлов на признаки утечки секретов.
 * Используется lint-staged в pre-commit и как CI gate в security job.
 *
 * Fail-closed правила:
 * - пустой список файлов НЕ даёт успешный результат;
 * - при недоступном/неполном diff выполняется полное сканирование дерева;
 * - ошибка чтения файла завершает процесс с exit 1;
 * - в лог попадают только путь файла и имя правила, никогда содержимое секрета.
 */

const rules = [
  {
    name: 'закрытый ключ',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  { name: 'ключ доступа AWS', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'токен GitHub', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  {
    name: 'JSON Web Token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: 'жёстко заданный секрет',
    pattern: /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{8,}["']/i,
  },
  {
    // SEC-01: ловит именно тот класс дефекта, который был найден в env.schema.ts.
    name: 'статический JWT-секрет по умолчанию',
    pattern: /JWT_SECRET[^\n]{0,120}\.default\(/i,
  },
];

const EXCLUDED_BASENAMES = new Set(['.env.example', 'check-secrets.mjs']);

function gitBytes(args) {
  return execFileSync('git', args, { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] });
}

function splitNul(buffer) {
  return buffer
    .toString('utf8')
    .split('\0')
    .filter((item) => item.length > 0);
}

function isUsableSha(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{7,40}$/i.test(value) &&
    !/^0+$/.test(value)
  );
}

function commitExists(sha) {
  try {
    gitBytes(['cat-file', '-e', `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function fullTreeFiles() {
  try {
    return splitNul(gitBytes(['ls-files', '-z']));
  } catch (error) {
    throw new Error(`git ls-files недоступен: ${error.message}`, { cause: error });
  }
}

/** Возвращает файлы из GitHub event или null, если diff ненадёжен. */
function filesFromEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath === undefined || eventPath === '') {
    return { files: null, reason: 'нет GITHUB_EVENT_PATH' };
  }

  let event;
  try {
    event = JSON.parse(readFileSync(eventPath, 'utf8'));
  } catch (error) {
    return { files: null, reason: `GITHUB_EVENT_PATH не прочитан: ${error.message}` };
  }

  const eventName =
    process.env.GITHUB_EVENT_NAME ??
    (event.before !== undefined
      ? 'push'
      : event.pull_request !== undefined
        ? 'pull_request'
        : '');

  let base;
  let head;
  if (eventName === 'push') {
    base = event.before;
    head = event.after ?? process.env.GITHUB_SHA;
  } else if (eventName === 'pull_request') {
    base = event.pull_request?.base?.sha;
    head = event.pull_request?.head?.sha ?? process.env.GITHUB_SHA;
  }

  if (!isUsableSha(base) || !isUsableSha(head)) {
    return { files: null, reason: `недопустимые SHA для ${eventName || 'unknown'}` };
  }
  if (!commitExists(base) || !commitExists(head)) {
    return { files: null, reason: `commit отсутствует в истории для ${eventName}` };
  }

  try {
    const changed = splitNul(gitBytes(['diff', '--name-only', '-z', base, head]));
    if (changed.length === 0) {
      return { files: null, reason: `пустой diff для ${eventName}` };
    }
    return { files: changed, reason: `${eventName} diff` };
  } catch (error) {
    return { files: null, reason: `git diff завершился ошибкой: ${error.message}` };
  }
}

function resolveFiles(argv) {
  if (argv.length > 0) {
    return { files: argv, mode: 'explicit', reason: 'аргументы lint-staged' };
  }

  const fromEvent = filesFromEvent();
  if (fromEvent.files !== null) {
    return { files: fromEvent.files, mode: 'event-diff', reason: fromEvent.reason };
  }

  return { files: fullTreeFiles(), mode: 'full-tree', reason: fromEvent.reason };
}

function main() {
  const resolved = resolveFiles(process.argv.slice(2));
  const eligible = resolved.files.filter((file) => !EXCLUDED_BASENAMES.has(basename(file)));

  let files = eligible;
  let mode = resolved.mode;
  let reason = resolved.reason;

  if (files.length === 0) {
    if (mode === 'explicit') {
      console.error('Secret scan: нет файлов для проверки (fail-closed)');
      process.exit(1);
    }
    // event-diff дал только исключённые файлы — безопаснее просканировать всё дерево.
    files = fullTreeFiles().filter((file) => !EXCLUDED_BASENAMES.has(basename(file)));
    mode = 'full-tree';
    reason = `${reason}; после фильтрации список пуст`;
  }

  const findings = [];
  let scanned = 0;
  let skippedBinary = 0;

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch (error) {
      // Ошибка чтения — не основание для успешного решения security gate.
      console.error(`Secret scan: не удалось прочитать ${file}: ${error.code ?? error.message}`);
      process.exit(1);
    }
    if (content.includes('\u0000')) {
      skippedBinary += 1;
      continue;
    }
    scanned += 1;
    for (const rule of rules) {
      if (rule.pattern.test(content)) {
        findings.push(`${file}: ${rule.name}`);
      }
    }
  }

  console.log(
    `Secret scan: mode=${mode} reason=${reason} candidates=${files.length} scanned=${scanned} skippedBinary=${skippedBinary}`,
  );

  if (findings.length > 0) {
    console.error('Обнаружены потенциальные секреты, проверка прервана:');
    for (const finding of findings) {
      console.error(`  - ${finding}`);
    }
    process.exit(1);
  }
}

main();
