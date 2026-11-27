# VoltWireCraft v0.9.1 — G-11 CI E-1…E-4 Remediation Report

| Параметр | Значение |
|---|---|
| Репозиторий | `iilmchat/ai-VoltWireCraft` |
| Исходный implementation SHA | `8557ae35d69267072b1b35991f5fa7a6a4aeec09`, ветка `wave1-d1-d4-g11ci` |
| Изолированная ветка / worktree | `wave1-g11-ci-e1-e4`, `...\4bd13f\wave1-g11-ci-e1-e4` |
| Итоговый SHA | см. финальное сообщение Agent 2 (не фиксируется внутри самого себя) |
| Авторитетный аудит | `V091_WAVE1_FINAL_INDEPENDENT_AUDIT.md`, SHA-256 `872EE7EFD697D06AEE3EB416A1FB28107C38973505869A8C2557DCA38CF495D5` — проверен и совпал; прочитан полностью (строки 1–277); не изменялся |
| GitHub workflow id | `423851554`, path `.github/workflows/ci.yml`, `state=active` (read-only API) |
| Дата | 2026-11-26 |

## A. Baseline и безопасность репозитория

- Исходный commit доступен (`git cat-file -t` → `commit`); HEAD исходного worktree точно совпадал; `git status` — чистое.
- Stash `stash@{0}: On feat/v091-security-core: backup-before-main-sync-2026-11-26` — не трогался.
- `main` (@ `8f740c3…`), `calm-river`, `wave1-g11-g14`, `wave1-d1-d4-g11ci` — не изменялись.
- Не выполнялись push, PR, merge, tag, release, deployment, изменения GitHub Settings/Rulesets/Secrets.

## B. Изменённые файлы

| Path | Обоснование | Finding |
|---|---|---|
| `.github/workflows/ci.yml` | E-1: явный `workflow_dispatch` с input и комментарием о dispatch по ref; E-2: `set -euo pipefail` в build step; E-3: fail-closed `ldd`-проверки всех runtime-бинарников; E-4: health smoke через production Compose + `if: always()` cleanup | E-1…E-4 |
| `scripts/check-prod-calc-ci.test.mjs` | Вспомогательные тесты, читающие реальный текст шагов workflow и исполняющие negative-сценарии | E-1…E-4 |
| `V091_WAVE1_G11_CI_E1_E4_REMEDIATION_REPORT.md` | Обязательный отчёт | deliverable |

Не изменены: `scripts/check-secrets.mjs`, `scripts/check-secrets.test.mjs`, `apps/calc-engine/Dockerfile`, `Dockerfile.ci`, `docker-compose.yml`, `docker-compose.ci-smoke.yml`, `ci-integration.yml`, `release-desktop.yml`, package manifests, lockfiles.

## C. Результаты E-1…E-4

### E-1 — запуск CI на feature branch

`workflow_dispatch` сохранён и сделан явным: добавлен необязательный input `run_reason` для журнала PO; в комментарии зафиксирован точный способ запуска на нужном ref. Push/PR-триггеры **по-прежнему только `main`**, feature branch в них не добавлен; permissions/concurrency/required checks не тронуты.

Команды получения доказательств после отдельного разрешения PO на push:

1. PO разрешает push только ветки `wave1-g11-ci-e1-e4` (без PR, merge, release).
2. `git push origin wave1-g11-ci-e1-e4` — создаёт удалённую ветку; **сам push workflow не запускает**.
3. Ручной dispatch workflow из этой ветки:
   `gh workflow run ci.yml --repo iilmchat/ai-VoltWireCraft --ref wave1-g11-ci-e1-e4 -f run_reason="PO-approved G-11 evidence"`
   или `POST /repos/iilmchat/ai-VoltWireCraft/actions/workflows/423851554/dispatches` с `{"ref":"wave1-g11-ci-e1-e4","inputs":{"run_reason":"PO-approved G-11 evidence"}}`.
4. GitHub берёт **версию workflow и кода из выбранного ref**, поэтому в прогоне участвует именно `prod-calc-build` из этого коммита.
5. Проверка доказательств: `head_sha == <итоговый SHA>`, job `prod-calc-build` = `success`, артефакт `prod-calc-build-log` загружен, в логах — production `Dockerfile` (не `Dockerfile.ci`), лдд/health-шаги зелёные.

### E-2 — отказ build job при ошибке сборки

Build step теперь содержит `set -euo pipefail`; `docker compose build --pull --no-cache calc-engine 2>&1 | tee …`. Ошибка build напрямую завершает шаг; `docker inspect` не может «погасить» её. `continue-on-error` и `|| true` в job отсутствуют. Upload лога остаётся отдельным шагом `if: always()`.

Negative test (исполняется текст реального шага из workflow с подменой build-команды на `false`):
`pnpm exec vitest run scripts/check-prod-calc-ci.test.mjs -t E2-01` → **PASS**, exit code ненулевой, маркер `AFTER_FAILED_BUILD` не выведен.

### E-3 — fail-closed runtime dependency checks

Проверяются все три бинарника, реально присутствующих в production runtime image и перечисленных в `Dockerfile`: `/usr/local/bin/dwg2dxf`, `/usr/local/bin/dxf2dwg`, `/usr/local/lib/libredwg.so.0`. Список подтверждён `docker run --rm --entrypoint sh … ls/ldd` на существующем образе: `libplot` в runtime отсутствует. Добавлена явная проверка отсутствия build-only `/usr/local/bin/dwgplot`.

Для каждого `bin`: проверка существования файла; `out=$(ldd "$bin") || exit 1`; FAIL при `not found`; FAIL при `libplot|plot.h`. `set -eu` внутри `sh -c`.

Negative tests (73–141 мс каждый, реальный текст `-c` из workflow со stub `ldd`):

| ID | Сценарий | Результат |
|---|---|---|
| E3-01 | `ldd` exit 1 | exit 1, `ldd failed` |
| E3-02 | отсутствующий бинарник | exit 1, `missing runtime binary` |
| E3-03 | `libplot` в выводе | exit 1, `forbidden build-only dependency` |
| E3-04 | `not found` | exit 1, `unresolved dependency` |
| E3-05 | чистый набор | exit 0, `runtime dependency checks passed` |

### E-4 — health smoke через production Compose

`docker compose up -d --no-build calc-engine` (production `docker-compose.yml`, production `Dockerfile`, без `-f docker-compose.ci-smoke.yml`); ожидание до 60 попыток состояния `healthy` у `vwc-calc-engine` и `curl -fsS http://localhost:${CALC_ENGINE_PORT}/health`; при таймауте — `docker compose logs calc-engine` и exit 1. Отдельный шаг `if: always()` выполняет `docker compose down --remove-orphans` (без `-v`). `docker run -d` в smoke удалён.

Проверка структуры (E4-01) — PASS. Production Compose и приложение не изменялись; если бы конфигурация не позволила smoke, работа была бы остановлена.

## D. G-11 — статус доказательств

Триггеры, Dockerfile и Compose корректны статически. **Реального GitHub Actions run на итоговом SHA нет** (до push run невозможен по условиям задачи; `GET /actions/runs?head_sha=<commit>` → 0). Локальная production-сборка невозможна: сеть до Debian mirror закрыта в песочнице. Поэтому G-11 остаётся **CONDITIONAL PASS / NOT VERIFIED** до успешного dispatch-прогона.

## E. Проверки и exit codes

| Команда | Результат |
|---|---|
| `python -c yaml.safe_load(ci.yml)` | `YAML_OK jobs=7`, `dispatch=True`, `prod=Production calc-engine build (no CI override)` |
| `docker compose --env-file <temp> config --quiet` | exit 0 |
| `pnpm exec vitest run scripts/check-prod-calc-ci.test.mjs` | **9/9 passed**, exit 0 |
| `pnpm exec vitest run scripts/check-secrets.test.mjs scripts/check-prod-calc-ci.test.mjs` | **29 passed**, exit 0 |
| `pnpm test` | 4 задачи successful (turbo cache) |
| `pnpm lint` | exit 0 |
| `pnpm typecheck`, `pnpm typecheck:scripts` | exit 0 |
| `git diff --check` | exit 0 |
| `gh api /actions/workflows` | ci.yml id `423851554`, active |
| `grep continue-on-error\|\|\| true` в ci.yml | совпадений нет |

Пропущенных тестов нет; существующие тесты не изменялись ради PASS.

## F. Residual risks и непроверенные сценарии

- G-11 actual CI evidence отсутствует до push + dispatch; PASS по YAML-статике не выдаётся.
- Локальная production-сборка заблокирована сетью песочницы (Debian mirror).
- Реальный fork-PR путь G-14 и поведение `fetch-depth: 0` в Actions не проверялись в этом задании.
- E-5/E-6 из предыдущего аудита (normalized separator, TOCTOU 50 МБ) — остаточные риски, не в этом scope.
- Время CI увеличится из-за компиляции LibreDWG; нужна оценка квот runner.

## G. Authorization boundary

Подтверждаю: `main` не менялся; push/PR/merge не выполнялись; GitHub Settings/Rulesets/Secrets не изменялись; stash и исходные worktrees не трогались; deployment/tag/release не выполнялись; scope не расширялся на G-14, NEW-01, ERP/HITL, G-16.

## H. Verdict

| Finding | Статус |
|---|---|
| E-1 | **PASS** (static + API workflow id; dispatch procedure documented) |
| E-2 | **PASS** (negative test с реальным текстом шага) |
| E-3 | **PASS** (4 negative + 1 positive test) |
| E-4 | **PASS** (структура и cleanup подтверждены; реальный smoke — после CI) |
| G-11 | **CONDITIONAL PASS / NOT VERIFIED** до успешного GitHub Actions run на фактическом SHA |
| Общий verdict | **CONDITIONAL PASS** |

**Production GO не выдаётся и не подразумевается. Финальное решение принимает PO.**

*Исходный аудит Agent 3 не изменялся; отчёт создан в изолированной ветке.*
