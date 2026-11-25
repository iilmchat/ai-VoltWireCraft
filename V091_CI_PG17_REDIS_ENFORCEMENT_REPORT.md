# V091_CI_PG17_REDIS_ENFORCEMENT_REPORT — Agent 2

| Параметр | Значение |
|---|---|
| Ветка | `integration/v091-verification` |
| Исходный SHA | `2e826978f90d489da231d33740621f15844bb8c8` |
| CI-реализация | `52da6610545eca157c1d771a5ce61e64fbcec752` |
| Workflow fixes | `fdf1230b9e77fbb7ad4116ecefa607f2c0f9c574` |
| CI run (успешный integration job) | https://github.com/iilmchat/ai-VoltWireCraft/actions/runs/45585832171 |
| CI run (первый, диагностический) | https://github.com/iilmchat/ai-VoltWireCraft/actions/runs/45584372809 |

---

## 1. Изменённые файлы

| Файл | Изменение |
|---|---|
| `.github/workflows/ci.yml` | Добавлен job `integration` с реальными PostgreSQL 17 и Redis; `workflow_dispatch`; env `VWC_PG17_URL`/`VWC_REDIS_URL`; проверка сервисов; JUnit gate; smoke job получил обязательные переменные compose и регистрацию тестовой учётки |
| `scripts/assert-ci-junit.mjs` | **новый** CI gate: проверяет `failures=0`, `errors=0`, `skipped=0`, наличие suite `postgres17-refresh.test.ts` (≥7 тестов) и `redis-readiness.test.ts` (≥2 теста, 0 skipped) |

Security/business logic, PO-D01, PO-D13-01, origin/CSRF, trust proxy и refresh-логика не изменялись.

## 2. Изменения workflow и обоснование

- Раньше `VWC_PG17_URL` и `VWC_REDIS_URL` не передавались; `describe.skipIf`/`it.skipIf` пропускали 8 тестов, а CI оставался зелёным. Теперь отдельный job `integration` поднимает оба сервиса и явно проверяет обязательные переменные: отсутствие сервиса завершает шаг ошибкой до запуска тестов.
- `workflow_dispatch` добавлен, чтобы прогонять integration-ветку без merge в `main`.
- Проверка Redis переведена с отсутствующего на runner `redis-cli` на уже установленный `ioredis` (`import { Redis } from "ioredis"`, `ping() === PONG`).
- Для PostgreSQL 17 используется `pg_isready` healthcheck и `psql ... select version() | grep "PostgreSQL 17"`.
- Тестовая БД `vwc_pg17_test` создаётся отдельно от основной `voltwirecraft`, поэтому `DROP TABLE` в `postgres17-refresh.test.ts` не затрагивает миграции остальных тестов.
- Smoke job получил test-only dummy secrets и `AUTH_ALLOWED_ORIGINS`, а также шаг регистрации тестовой учётки `smoke.${{ github.run_id }}@example.com`.

## 3. PostgreSQL 17 и Redis

**PostgreSQL 17:** `pgvector/pgvector:pg17`, healthcheck `pg_isready -U vwc -d voltwirecraft`, порт 5432. `VWC_PG17_URL=postgresql://vwc:vwc@localhost:5432/vwc_pg17_test`. Тесты подтверждают реальный движок через `SELECT version()` (в CI: PostgreSQL 17.12) и создают/удаляют таблицы именно в `vwc_pg17_test`.

**Redis:** `redis:7-alpine`, healthcheck `redis-cli ping` внутри контейнера, порт 6379. `VWC_REDIS_URL=redis://localhost:6379/0`, `REDIS_URL` тот же. Reconnect-тест использует настоящий `RedisService` + `ioredis`. FakeRedis остаётся только в `auth-rate-limit.test.ts` как unit/integration double и не выдаётся за реальный Redis.

Передаваемые переменные: `NODE_ENV=test`, `DATABASE_URL`, `VWC_PG17_URL`, `VWC_REDIS_URL`, `REDIS_URL`, `CALC_ENGINE_URL`, `JWT_SECRET`, `JWT_REFRESH_HASH_PEPPER`, `HITL_SIGNING_KEY`, `INTERNAL_SERVICE_TOKEN`, `AUTH_ALLOWED_ORIGINS`, `AUTH_RATE_LIMIT_ACCOUNT_KEY`. Все значения — тестовые dummy.

## 4. Результаты

| Проверка | Результат |
|---|---|
| Локальный полный API suite с PG17 + Redis (`artifacts/junit-ci-enforcement.xml`) | **215 passed / 0 failed / 0 skipped** |
| Локальный negate-тест gate без `VWC_*` (`artifacts/junit-ci-negative.xml`) | Gate **FAIL**: `skipped=8`; PostgreSQL suite skipped=7; Redis suite skipped=1; exit 1 |
| CI integration job (run `45585832171`) | **PASS**; JUnit `tests=215 failures=0 errors=0 skipped=0`, PostgreSQL 7, Redis 2 |
| CI integration job (run `45584372809`) | FAIL: `redis-cli: command not found` — исправлено во втором коммите |
| Локальные PG17-тесты отдельно | 7/7 |
| Локальные Redis readiness/reconnect отдельно | 2/2 |
| `pnpm --filter api typecheck` / `build` | PASS |
| `npx eslint` workflow script и suite | PASS |
| YAML parse (`yaml.safe_load`) | PASS; jobs: node, python, security, integration, smoke, compose |
| `scripts/check-secrets.mjs` workflow | PASS |

JUnit из CI загружен через `gh run download -n integration-reports` и повторно проверен `assert-ci-junit.mjs` → `CI JUnit gate PASSED`.

## 5. Итог по задаче

Цель задачи достигнута в части CI enforcement: реальные PostgreSQL 17 и Redis запускаются, 8 ранее пропускавшихся тестов выполняются, итоговый JUnit integration job показывает **0 skipped**, а отсутствие сервисов/limit env приводит к ошибке gate. Локальный developer workflow с skip вне CI сохранён.

**Общий workflow run всё ещё красный по причинам вне Scope этой задачи:**

1. `security` job — `pnpm audit --audit-level=high` находит 2 high + 1 moderate в `xlsx@0.18.5` (`apps/web/package.json`). Гейт не ослаблен; обновление зависимости не разрешено этим заданием.
2. `smoke` job — сборка `calc-engine` падает при компиляции LibreDWG (`plotutils-devel` отсутствует в образе). Производственный Dockerfile не изменялся.

Поэтому нельзя заявлять «CI завершается успешно» в целом; можно подтвердить успешное завершение именно job `Integration (PostgreSQL 17 + Redis, no skips)` и его JUnit.

## 6. Known limitations

- `psql`/`createdb` доступны на GitHub `ubuntu-latest`, но отсутствуют в локальной Windows-среде; локальная проверка шла через `docker exec`.
- `workflow_dispatch` используется для прогона integration-ветки; push в `main` и PR не создавались.
- Внешние сервисы изолированы в job-контейнерах GitHub Actions; production-инфраструктура и GitHub Settings/Secrets не трогались.
- F-05/F-06/F-07 (keyring, destructive rollback, PG17 infrastructure) остаются в риск-реестре предыдущих отчётов.

Merge в main, merge PR, tag/release, deploy и GitHub Settings/Secrets не изменялись. Передаётся PO для независимой проверки Agent 3.
