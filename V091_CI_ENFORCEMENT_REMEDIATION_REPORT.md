# V091_CI_ENFORCEMENT_REMEDIATION_REPORT — Agent 2

| Параметр | Значение |
|---|---|
| Repository / worktree | `iilmchat/ai-VoltWireCraft`, `C:\Projects\AI\ai-VoltWireCraft-integration` |
| Ветка | `integration/v091-verification` |
| Исходный SHA | `6e7bd52c935bcc44810b548eb44cc69ced200abe` |
| Implementation commit | `e9e082fbb7bee963c33e6fe411f61e94925d76a1` |
| CI run implementation commit (event `push`) | https://github.com/iilmchat/ai-VoltWireCraft/actions/runs/45597146500 |
| Статус этого run | `success`, `headSha=e9e082f…`, JUnit `215/0/0` |

---

## 1. Изменённые файлы

| Файл | Изменение |
|---|---|
| `.github/workflows/ci.yml` | integration job заменён вызовом reusable workflow; PostgreSQL image зафиксирован по digest в jobs `node` и `security`; сохранены trigger main/PR и `workflow_dispatch` |
| `.github/workflows/ci-integration.yml` | **новый** reusable workflow с `workflow_call` + `push` только в `integration/v091-verification`; единственная реализация integration job |
| `scripts/assert-ci-junit.mjs` | полная замена regex-парсера на строгий разбор `fast-xml-parser` + manifest из 25 suite |
| `scripts/assert-ci-junit.test.mjs` | **новый**: 15 автоматических тестов gate |
| `package.json`, `pnpm-lock.yaml` | добавлена dev-only зависимость `fast-xml-parser@5.12.1` с фиксированной версией |

Не изменены: JWT/refresh/session, RBAC/guards, rate limiter, Origin/CSRF/cookies, SQL миграции, схемы БД, ERP/HITL, production compose/Dockerfiles, GitHub Settings/Secrets, main.

---

## 2. XML parser и надёжность gate (CI-A / CI-B)

- Проверены существующие зависимости: подходящего XML-парсера в проекте не было. Выбран минимальный dev-only `fast-xml-parser@5.12.1` (пинг версии в `package.json`, lockfile обновлён pnpm).
- `XMLValidator.validate(xml)` отклоняет malformed/unclosed XML до разбора.
- `XMLParser({ ignoreAttributes:false, attributeNamePrefix:'@_', parseAttributeValue:false })` строит дерево; regex больше не используется для принятия решения.
- Gate проверяет:
  1. отсутствие/пустой файл → FAIL;
  2. корректный root `<testsuites>` и числовые атрибуты `tests/failures/errors`;
  3. `sum(suite.tests) === root.tests` и `count(testcase) === root.tests`;
  4. согласованность failures/errors/skipped между root, suite-атрибутами и тегами `<failure>/<error>/<skipped>`;
  5. `skipped` во **всех** suite, включая атрибут `skipped="N"`;
  6. ненулевые failures/errors/skipped → FAIL;
  7. присутствие всех 25 обязательных suite из зафиксированного manifest;
  8. PostgreSQL suite ≥7 тестов и 0 skipped, Redis suite ≥2 теста и 0 skipped.
- Добавление новых suite/тестов не ломает gate (totals вычисляются динамически); исчезновение обязательного suite, обрезанный XML и ложные totals — FAIL.

### Автоматические негативные сценарии

`pnpm exec vitest run scripts/assert-ci-junit.test.mjs` — **15/15 passed**:

valid PASS; missing file FAIL; empty FAIL; malformed/unclosed FAIL; missing root FAIL; missing PostgreSQL FAIL; missing Redis FAIL; missing другой обязательный suite FAIL; `tests=0` FAIL; mismatched totals FAIL; failures FAIL; errors FAIL; `<skipped>` tag FAIL; `skipped="1"` атрибут FAIL; урезанный XML с поддельным root FAIL; корректный полный JUnit 0 skipped PASS.

Все фикстуры создаются в `mkdtemp` и удаляются; реальный CI-артефакт не изменяется.

---

## 3. Автоматический запуск (CI-C)

- Новый `.github/workflows/ci-integration.yml` имеет триггеры `workflow_call` и `push: branches: [integration/v091-verification]`.
- `.github/workflows/ci.yml` сохранил `push`/`pull_request` на `main` и `workflow_dispatch`, но больше не дублирует integration job — он вызывает reusable workflow через `uses: ./.github/workflows/ci-integration.yml`.
- Доказательство: после push implementation commit `e9e082f` автоматически запустился run `45597146500`, `event=push`, `headSha=e9e082fbb7bee963c33e6fe411f61e94925d76a1`. Ручной `workflow_dispatch` для этого запуска не использовался.
- Другие jobs не сделаны условно skipped; `continue-on-error` не добавлялся.

---

## 4. PostgreSQL 17 image (CI-D)

- Digest взят из реальных pull-логов run `45585832171`: `sha256:b513c48566e4777cd3370451400000c78eda6a08131d68f4c31d4a76f27bd8fd`.
- Локально выполнен `docker pull pgvector/pgvector@sha256:…`, `docker image inspect` подтвердил тот же digest; внутри образа:
  - `select version()` → `PostgreSQL 17.12 (Debian 17.12-1.pgdg12+1)`;
  - `CREATE EXTENSION IF NOT EXISTS vector` → `CREATE EXTENSION`.
- Все PostgreSQL 17 services в CI (`node`, `security`, reusable integration) используют одно и то же immutable значение; в комментарии сохранена читаемая версия `pgvector/pgvector:pg17`.
- Runtime-проверки в integration job: `psql … select version() | grep "PostgreSQL 17.12"`, `SELECT extname FROM pg_extension WHERE extname='vector'`.

---

## 5. Результаты проверок

| Проверка | Результат |
|---|---|
| Gate regression tests | **15 passed** |
| Локальный полный API suite с PG17.12 + Redis (`artifacts/junit-harden-local.xml`) | **215 passed / 0 failed / 0 skipped**, 25 suite |
| PostgreSQL 17 suite локально | 7/7 |
| Redis readiness/reconnect локально | 2/2 |
| CI integration job, run `45597146500` (SHA `e9e082f`) | **success**, JUnit из artifacts: `tests=215 failures=0 errors=0 skipped=0`, 25 suite, PG 7, Redis 2, gate PASSED |
| `pnpm --filter api typecheck`, `build`, `pnpm typecheck:scripts` | PASS |
| `npx eslint` gate/test/workflow scripts, secret scan, YAML parse | PASS |

## 6. Ограничения и открытые XML/CI-E finding

- CI-E остаётся открытым и не исправлялся: Security job падает на `pnpm audit --audit-level=high` (уязвимости `xlsx`), smoke job падает при сборке `calc-engine` (LibreDWG требует GNU plotutils/libplot). Гейты не ослаблены, зависимости и production Dockerfile не менялись. Общий `ci.yml` поэтому может оставаться красным; зелёным является integration workflow.
- `workflow_dispatch` сохранён в `ci.yml`; push в `main` и PR в `main` не затрагивались.
- GitHub Actions dependency annotation: `actions/upload-artifact@v4` targets Node 20, runner принудительно использует Node 24 — предупреждение, не failure.
- Документационный коммит отчёта также запустит integration workflow автоматически; итоговый SHA и ссылка на его run передаются PO в финальном сообщении.

---

Merge в main, merge PR, release/tag, deploy и GitHub Settings/Secrets не изменялись. Передаётся PO для независимой проверки Agent 3.
