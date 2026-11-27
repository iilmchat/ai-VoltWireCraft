# VoltWireCraft v0.9.1 — G-11 final microfix (F-1, F-3)

| Параметр | Значение |
|---|---|
| Репозиторий | `iilmchat/ai-VoltWireCraft` |
| Базовый SHA | `1f286f6c195b4b14eb7f83fa5bd37615944e530b`, ветка `wave1-g11-ci-e1-e4` |
| Изолированная ветка / worktree | `wave1-g11-f1-f3`, `...\4bd13f\wave1-g11-f1-f3` |
| Итоговый SHA | см. финальное сообщение Agent 2 |
| Дата | 2026-11-27 |
| Режим | Микродоработка G-11; без push/dispatch/PR/merge |

## A. Baseline и безопасность

- HEAD исходного worktree точно совпадал с базовым SHA; рабочее дерево было чистым.
- Stash `stash@{0}: On feat/v091-security-core: backup-before-main-sync-2026-11-26` не трогался.
- `main` (@ `8f740c3…`) и исходные worktrees (`wave1-d1-d4-g11ci`, `wave1-g11-ci-e1-e4`, `calm-river`, `quiet-comet`) не изменялись.
- Не выполнялись push, workflow_dispatch, PR, merge, tag, release, deploy; GitHub Settings/Rulesets/Secrets не изменялись.

## B. Изменённые файлы и diff

| Path | Изменение | finding |
|---|---|---|
| `.github/workflows/ci.yml` | F-1: после `out=$(ldd "$bin")` добавлены проверки пустого вывода и отсутствия шаблона `=>`; F-3: пример dispatch обновлён на `wave1-g11-ci-e1-e4` | F-1, F-3 |
| `scripts/check-prod-calc-ci.test.mjs` | Добавлены режимы stub `empty`/`invalid`, тесты F1-01/F1-02, проверка актуальности dispatch-ref в E1-01 | F-1, F-3 |
| `V091_WAVE1_G11_FINAL_MICROFIX_REPORT.md` | Настоящий отчёт | deliverable |

`git diff --check` → exit 0. Не изменены: scanner и его тесты, Dockerfile, Dockerfile.ci, Compose, другие workflows, manifests/lockfiles.

Точный diff относительно базового SHA: 3 файла (M `.github/workflows/ci.yml`, M `scripts/check-prod-calc-ci.test.mjs`, A отчёт).

## C. F-1 — fail-closed при пустом/некорректном выводе ldd

Было: `out=$(ldd "$bin") || exit 1` и проверки `not found`/`libplot`; при exit 0 и пустом stdout шаг считался успешным.

Стало (внутри runtime `sh -c`):

```
out=$(ldd "$bin") || { echo "ldd failed: $bin" >&2; exit 1; }
if [ -z "$out" ]; then echo "empty ldd output for $bin" >&2; exit 1; fi
if ! printf "%s\n" "$out" | grep -q "=>"; then echo "invalid ldd output for $bin" >&2; exit 1; fi
```

Результаты тестов (исполняется реальный текст `-c` из workflow со stub `ldd`):

| ID | Сценарий | Результат |
|---|---|---|
| F1-01 | `ldd` exit 0, пустой stdout | exit 1, `empty ldd output` — PASS |
| F1-02 | `ldd` exit 0, вывод без `=>` | exit 1, `invalid ldd output` — PASS |
| E3-05 | корректный непустой вывод | exit 0, `runtime dependency checks passed` — PASS |
| E3-01 | `ldd` exit 1 | exit 1, `ldd failed` — PASS |
| E3-02 | отсутствующий бинарник | exit 1, `missing runtime binary` — PASS |
| E3-03 | `libplot` в выводе | exit 1, `forbidden build-only dependency` — PASS |
| E3-04 | `not found` | exit 1, `unresolved dependency` — PASS |
| E2-01 | ошибка build-команды | exit ≠ 0, маркер не выведен — PASS |
| E2-02 | upload-artifact через `if: always()` | PASS |
| E1-01 / E4-01 | триггеры и Compose-smoke | PASS |

Итого: **11/11 тестов** `scripts/check-prod-calc-ci.test.mjs` зелёные; предыдущие E-1…E-4 negative-тесты сохранены без ослабления.

## D. F-3 — актуальный dispatch-пример

Комментарий в `ci.yml` теперь использует актуальный пример:

`POST /repos/iilmchat/ai-VoltWireCraft/actions/workflows/ci.yml/dispatches` с телом `{"ref":"wave1-g11-ci-e1-e4"}`.

Устаревшее значение `wave1-d1-d4-g11ci` удалено; тест E1-01 явно проверяет наличие нового и отсутствие старого ref. Push/PR-триггеры остаются только на `main`, workflow id `423851554`, `state=active` (read-only API).

## E. F-2 — не исправляется (обоснование)

F-2 (потенциальное состояние между шагами на раннере) не требует изменения: job `prod-calc-build` выполняется на **ephemeral GitHub-hosted runner** (`runs-on: ubuntu-latest`). Каждый job получает свежую виртуальную машину; `actions/checkout@v7` создаёт чистый checkout, а `docker compose build --no-cache` не использует предыдущий образ как доказательство. После завершения job среда уничтожается, поэтому перенос состояния между прогонами невозможен и дополнительная изоляция не нужна. Изменение инфраструктуры runner вышло бы за разрешённый scope и требует отдельного PO-решения.

## F. Проверки

| Команда | Результат |
|---|---|
| `pnpm exec vitest run scripts/check-prod-calc-ci.test.mjs` | 11 passed, exit 0 |
| `pnpm exec vitest run scripts/check-secrets.test.mjs scripts/check-prod-calc-ci.test.mjs` | 31 passed, exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm typecheck:scripts` | exit 0 |
| `python -c yaml.safe_load(ci.yml)` | YAML_OK, jobs=7 |
| `git diff --check` | exit 0 |
| grep `continue-on-error` / `|| true` в ci.yml | совпадений нет |

## G. Ограничения и статус G-11

Реальный GitHub Actions run по-прежнему отсутствует: push и dispatch не разрешены и не выполнялись. Локальная production-сборка невозможна из-за сетевого ограничения песочницы (Debian mirror). Поэтому **G-11 остаётся CONDITIONAL PASS / NOT VERIFIED** до успешного dispatch-прогона на фактическом implementation SHA.

## H. Authorization boundary и verdict

Подтверждаю: `main`, stash и исходные worktrees не изменялись; push/PR/merge/dispatch/release/deploy не выполнялись; scope не расширялся; ERP/HITL, NEW-01, G-16 не тронуты.

| Finding | Статус |
|---|---|
| F-1 | **PASS** (negative + positive tests) |
| F-3 | **PASS** (ref актуален, проверено тестом) |
| F-2 | **НЕ ИСПРАВЛЯЕТСЯ** — ephemeral runner, обоснование выше |
| G-11 | **CONDITIONAL PASS / NOT VERIFIED** |
| Итог | **CONDITIONAL PASS** |

**Production GO не выдаётся. Финальное решение принимает PO.**

*Отчёт создан в изолированной ветке; исходные артефакты аудита не изменялись.*
