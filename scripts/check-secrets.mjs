import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * Проверка файлов, попадающих в коммит, на признаки утечки секретов.
 * Используется lint-staged в хуке pre-commit (RULES § 6).
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

const files = process.argv.slice(2).filter((file) => {
  const name = basename(file);
  return name !== '.env.example' && name !== 'check-secrets.mjs';
});

const findings = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  // Пропускаем бинарные файлы: в них нет осмысленного текста для проверки.
  if (content.includes('\u0000')) {
    continue;
  }
  for (const rule of rules) {
    if (rule.pattern.test(content)) {
      findings.push(`${file}: ${rule.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error('Обнаружены потенциальные секреты, коммит прерван:');
  for (const finding of findings) {
    console.error(`  - ${finding}`);
  }
  process.exit(1);
}
