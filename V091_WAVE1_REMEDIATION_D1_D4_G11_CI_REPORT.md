# VoltWireCraft v0.9.1 — Wave 1 Remediation Report (D-1…D-4 + G-11 CI)

| Параметр | Значение |
|---|---|
| Репозиторий | `iilmchat/ai-VoltWireCraft` |
| Исходный baseline | `8f740c344b567ef46b673159d6ab8210126c1eef` |
| Предыдущий implementation commit | `913ac3c9b35c905a78b343f5bd378d06517dab5d` |
| Изолированная ветка / worktree | `wave1-d1-d4-g11ci`, `...\4bd13f\wave1-d1-d4-g11ci` |
| Авторитетный аудит | `V091_WAVE1_G11_G14_INDEPENDENT_AUDIT.md` (Agent 3), прочитан полностью, строки 1–272; не изменялся |
| Дата | 2026-11-26 |
| Режим | Implementation в изолированной ветке; **без push/PR/merge/deploy** |

## A. Baseline и безопасность репозитория

| Проверка | Результат |
|---|---|
| Starting worktree / SHA | `wave1-g11-g14` @ `913ac3c9b35c905a78b343f5bd378d06517dab5d`, рабочее дерево чистое |
| Implementation commit доступен | `git cat-file -t 913ac3c…` → `commit` |
| Сравнение с предыдущим commit | `git diff --stat 913ac3c… HEAD` до изменений — пусто |
| Starting SHA (новый worktree) | `913ac3c9b35c905a78b343f5bd378d06517dab5d` |
| Final SHA | передаётся в финальном сообщении; ветка `wave1-d1-d4-g11ci` |
| `git status --short --branch` | `## wave1-d1-d4-g11ci`, чистое после коммита |
| Stash | `stash@{0}: On feat/v091-security-core: backup-before-main-sync-2026-11-26` — **не трогался** |
| `main` | остался на `8f740c3…`, не изменялся |
| Исходный worktree `calm-river` | не изменялся |

## B. Изменённые файлы

| Path | Назначение | Finding |
|---|---|---|
| `scripts/check-secrets.mjs` | Удаление/переименование в diff не читаются; explicit no-op; бинарники сканируются; исключения по точным путям | G-14 (D-1…D-4) |
| `scripts/check-secrets.test.mjs` | Добавлены тесты D1-01…D1-04, D2-01…D2-02, D3-01…D3-03, D4-01…D4-03 | G-14 |
| `.github/workflows/ci.yml` | Новый job `prod-calc-build` со штатной production-сборкой | G-11 |
| `V091_WAVE1_REMEDIATION_D1_D4_G11_CI_REPORT.md` | Настоящий отчёт | deliverable |

Не изменены: `apps/calc-engine/Dockerfile`, `Dockerfile.ci`, `docker-compose.yml`, `docker-compose.ci-smoke.yml`, исходники приложения, env-схемы. Подтверждено `git diff --name-status` относительно `913ac3c…`.

## C. G-14 — устранение D-1…D-4

### Причины дефектов и исправления

- **D-1 (удалённые файлы):** `git diff --name-only -z` включал статус `D`; scanner пытался `readFileSync` отсутствующего файла и получал ENOENT → exit 1. Исправление: `--no-renames --diff-filter=ACMRT` (rename → delete+add, новый путь остаётся); пути, отсутствующие и в head (`git cat-file -e <head>:<path>`), отбрасываются. Путь, который есть в head, но отсутствует в рабочем дереве, **оставляется** и вызывает exit 1 — настоящая ошибка чтения не маскируется.
- **D-2 (explicit-режим):** после фильтрации исключённых путей список становился пустым и шаг завершался exit 1, блокируя коммит scanner/.env.example. Теперь это валидный no-op с exit 0 и явным логом `candidates=0`. CI-пути при неопределённом diff по-прежнему переходят в `full-tree`; пустое дерево даёт fail-closed exit 1.
- **D-3 (NUL-байты):** ранее любой файл с `\0` полностью пропускался (`skippedBinary`) — секрет внутри бинарника проходил. Теперь файл читается как Buffer; при наличии NUL используется `latin1`-представление, поэтому ASCII-шаблоны правил обнаруживаются; введён лимит 50 МБ с fail-closed при превышении. Логи содержат только путь, имя правила и счётчики.
- **D-4 (исключение по basename):** `.env.example` / `check-secrets.mjs` исключались в любом каталоге. Заменено на точные относительные пути `.env.example` и `scripts/check-secrets.mjs`; файлы с теми же именами в других каталогах сканируются.

Detection rules (6 шт.) **не изменены**. `|| true` в security decision path отсутствует.

### Результаты тестов

`pnpm exec vitest run scripts/check-secrets.test.mjs` → **20/20 passed**:

| ID | Статус | ID | Статус |
|---|---|---|---|
| G14-01 | PASS | D1-01 | PASS |
| G14-02 | PASS | D1-02 | PASS |
| G14-03 | PASS | D1-03 | PASS |
| G14-04 | PASS | D1-04 | PASS |
| G14-05 | PASS | D2-01 | PASS |
| G14-06 | PASS | D2-02 | PASS |
| G14-07 | PASS | D3-01 | PASS |
| G14-08 | PASS | D3-02 | PASS |
| | | D3-03 | PASS |
| | | D4-01 | PASS |
| | | D4-02 | PASS |
| | | D4-03 | PASS |

Полное сканирование дерева: `node scripts/check-secrets.mjs` → `mode=full-tree candidates=353 scanned=353 binary=12`, exit 0. Pre-commit (`lint-staged`) прошёл при коммите (сканер и eslint execution — success). Синтетический секрет собран динамически в тесте и не появляется в stdout/stderr (утверждения D3-01, D3-03, G14-03, G14-08). Реальные секреты не использовались.

## D. G-11 — production build в CI

Добавлен отдельный job `prod-calc-build` (не зависит от smoke / CI-only job):

- checkout репозитория;
- `docker compose build --pull --no-cache calc-engine` — **штатный `docker-compose.yml`**, `dockerfile: Dockerfile`, без `-f docker-compose.ci-smoke.yml`, без `Dockerfile.ci`;
- `set -o pipefail` + `tee "${RUNNER_TEMP}/prod-calc-build.log"` — логи сохраняются, ошибка build даёт FAIL;
- `docker inspect` — фиксация ID образа в `${RUNNER_TEMP}/prod-calc-image-id.txt`;
- runtime-проверка: `ldd dwg2dxf`, `ldd dxf2dwg`, `ldd libredwg.so.0`, явный FAIL при наличии `libplot` в runtime;
- runtime smoke: `GET /health` на `localhost:18000`, 30 попыток, FAIL при недоступности;
- `upload-artifact` с `if: always()` — лог сборки доступен для диагностики.

Env job содержит только безопасные test-only dummy значения для interpolate compose; реальных секретов нет. `continue-on-error` и `|| true` в шагах build/smoke отсутствуют.

**CI run на актуальном implementation SHA: отсутствует.** GitHub API: `GET /actions/runs?head_sha=<новый commit>` → `total_count=0`; `?branch=wave1-d1-d4-g11ci` → `total_count=0`. Push в репозиторий запрещён условиями задачи, поэтому workflow не публиковался. Следовательно, критерий G11-CI-07 не выполнен, и G-11 не может получить PASS в этом отчёте.

Локальный чистый production build также невозможен: сеть до `deb.debian.org` заблокирована в песочнице (подтверждено `curl -I` timeout и `apt-get update` connection refused внутри контейнера). CI-only сборка не принимается как доказательство G-11.

## E. Regression results

| Проверка | Результат |
|---|---|
| `pnpm exec vitest run scripts/check-secrets.test.mjs` | 1 файл, **20 passed / 0 failed / 0 skipped** |
| `pnpm exec vitest run scripts/check-secrets.test.mjs scripts/verify-vendored-xlsx.test.mjs scripts/assert-ci-junit.test.mjs` | 3 файла, **56 passed** |
| `pnpm test` | 4 задачи successful (turbo cache); shared 27, web 99, api **207 passed / 8 skipped**; итого **333 passed / 8 skipped** (8 skip — PG17/Redis-зависимые тесты без env, предсуществующее поведение) |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm typecheck:scripts` | exit 0 |
| `pnpm install --frozen-lockfile` | exit 0 |
| YAML parse ci.yml + compose | OK |
| `docker compose --env-file <temp> config --quiet` | exit 0 |
| `git diff --check` | exit 0 |

Скрытых или изменённых ради PASS тестов нет; G14-01…G14-08 сохранены без ослабления.

## F. Residual risks

- **G-11 не подтверждён:** нужен реальный CI run на implementation SHA после отдельно разрешённого push. До этого статус — CONDITIONAL PASS.
- Время CI увеличится из-за компиляции LibreDWG в новом job; требуется оценка квот runner.
- D-5 (устаревший комментарий в `Dockerfile.ci` о «неизменённом production пути») — вне разрешённого scope, не исправлялся.
- D-7 (LibreDWG по-прежнему `--depth 1`, G-16) — вне scope, не закрыт.
- Реальный GitHub Actions путь для G-14 (fork PR, `fetch-depth: 0`) не проверен без публикации workflow.
- Лимит 50 МБ на файл — осознанная граница: файлы больше завершают scan с FAIL, а не пропускаются.

## G. Authorization boundary

Подтверждаю отсутствие: изменений `main`; merge/rebase/cherry-pick; push; PR; GitHub Settings/Rulesets/Secrets/branch protection; deployment; tags/releases; изменений stash; изменений `trust proxy`, PO-D01, NEW-01, ERP/HITL, Redis HA, backup/restore; несвязанного рефакторинга. `apps/calc-engine/Dockerfile`, `Dockerfile.ci` и Compose не изменялись.

## H. Verdict

| Finding | Статус |
|---|---|
| D-1 | **PASS** |
| D-2 | **PASS** |
| D-3 | **PASS** |
| D-4 | **PASS** |
| G-14 | **PASS** |
| G-11 | **CONDITIONAL PASS** (job добавлен, успешный CI run на implementation SHA отсутствует) |
| Wave 1 | **CONDITIONAL PASS** |

**Production GO не выдаётся и не подразумевается. Финальное решение принимает PO.**

*Implementation commit: точный SHA передаётся в финальном сообщении Agent 2 (не фиксируется внутри самого себя). Отчёт создан в изолированной ветке; исходный аудит Agent 3 не изменялся.*
