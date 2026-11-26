# SEC02_FINAL_FINDINGS_REMEDIATION_REPORT — Agent 2

| Параметр | Значение |
|---|---|
| Ветка | `integration/v091-verification` |
| Исходный SHA | `8866f0e49115d3ecc8d82e42157c0ff527f6d321` |
| Конечный SHA кода | `2274b0f8ecad842299b20bbed0f740dbc098e948` |
| JUnit кода | `artifacts/junit-2274b0f8ecad842299b20bbed0f740dbc098e948.xml` — `tests="196" failures="0" errors="0"` |

---

## 1. Изменённые файлы

| Файл | Изменение |
|---|---|
| `apps/api/src/auth/auth-rate-limit.service.ts` | **новый**: Redis-backed limiter (Lua INCR+EXPIRE), fail-closed 429 |
| `apps/api/src/auth/security.guard.ts` | вызов лимитера до/после аутентификации; идентификатор клиента из `req.ip` |
| `apps/api/src/auth/auth.module.ts` | провайдер/экспорт `AuthRateLimitService` |
| `apps/api/src/auth/auth.service.ts` | `issueAsync` при login —session + refresh в одной транзакции |
| `apps/api/src/config/env.schema.ts` | лимиты; production требует `AUTH_ALLOWED_ORIGINS`, wildcard запрещён |
| `apps/api/src/main.ts` | явный `trust proxy = false` |
| `apps/api/test/auth-rate-limit.test.ts` | **новый**: 6 тестов F-03 |
| `apps/api/test/refresh-session.test.ts` | F-01 capture UUID + F-02 fault injection |
| `apps/api/test/env.schema.test.ts`, `rbac-http.test.ts`, `erp-hitl-integration.test.ts` | адаптация и F-04-тесты |
| `apps/api/vitest.config.ts` | высокие лимиты только в test-runner |
| `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml` | документирование и передача новых переменных |
| `scripts/e2e-smoke.mjs` | подготовлен auth-поток smoke (login → fail-closed → refresh → me) |

---

## 2. F-01 — негативный тест регистрации

Прокси `failingAfter` расширен перехватом `.values()`/`.returning()`, что позволяет зафиксировать **реальный UUID**, созданный внутри транзакции до её отката. Тест `F-01`: внедряет отказ на втором INSERT (сессия) и проверяет:

- `createdUserId` — валидный UUID;
- пользователя с этим id и email нет;
- сессий с этим `userId` нет;
- количество сессий и refresh-записей не изменилось.

Нет вакуумной проверки `'failed-user'`. Тест зелёный.

## 3. F-02 — атомарность login

`AuthService.issueAsync` теперь вызывает:

```ts
this.db.transaction((tx) => this.sessions.issueAsync(user.id, tx as …))
```

Единый transaction executor исключает состояние «сессия без refresh-записи». Fault-injection тест `F-02` создаёт пользователя, отказывает на первом INSERT (auth_sessions) и доказывает: пользователь остаётся, сессий и refresh-записей не прибавляется. Cookie/body контракт `AuthResponse` с `user` сохранён. Регистрация по-прежнему оборачивает user + session + refresh в одну транзакцию; PO-D13-01 не изменена.

## 4. F-03 — rate limiting

- Алгоритм: фиксированное окно, Lua `INCR` + `EXPIRE` через уже развёрнутый Redis (`REDIS_URL`, `REDIS_CLIENT`), атомарно и **общий между инстансами** — один инстанс не является требованием.
- Операции: `login` (5/900s), `refresh` (10/300s), `logout`/`logout-all` (10/300s). Диапазоны настраиваются env.
- Идентификация: до аутентификации — `req.ip`; после refresh/logout — `sub` из проверенного токена. `X-Forwarded-For` не доверяется (`trust proxy=false`), простая подмена заголовка не обходит лимит.
- Превышение и ошибка Redis → `HttpException(429, 'Слишком много запросов. Повторите позже.')` — без раскрытия существования учётной записи.
- Тесты: превышение → 429, восстановление после окна, независимость операций и клиентов, fail-closed при ошибке Redis, `req.ip` vs подменённый заголовок, отдельная refresh-ветка.

В unit-тестах (`NODE_ENV=test`) используется локальный счётчик только потому, что Redis в раннере не поднимается; production-путь использует Redis.

## 5. F-04 — AUTH_ALLOWED_ORIGINS и cookie-CSRF

- `env.schema.ts`: в production `AUTH_ALLOWED_ORIGINS` обязателен, список origin разделяется запятой, wildcard (`*`) и не-HTTP(S) значения отвергаются; дефолта нет.
- `docker-compose.yml`: `AUTH_ALLOWED_ORIGINS: ${AUTH_ALLOWED_ORIGINS:?…}` — fail-fast на уровне compose. CI compose job получил dummy origin (не секрет). `.env.example` содержит формат и пример без реальных секретов.
- Cookie-поток проверен в `refresh-session.test.ts`: разрешённый Origin → 200; запрещённый/отсутствующий → 401; Tauri/body fallback сохранён.

## 6. InMemoryReplayStore — исследование

- Используется только как `HITL_REPLAY_STORE` в `HitlService.verifyAsync` (`replay-store.ts:17-32`, `hitl.service.ts:138`); refresh replay детектится БД (`auth_refresh_tokens.consumed_at`), от него в-memory store не зависит.
- Гарантия: одноразовость HITL-токена (`jti`). При двух инстансах каждый имеет свой `Map`, поэтому один и тот же `jti` может быть принят на каждом.
- Текущая эксплуатация: **fail-closed по PO-D05/PO-D14a** — ERP write и применение подтверждений всегда отклоняются, поэтому финансового эффекта от этого gap сейчас нет. Это латентный архитектурный риск, не маскируется документацией.
- Deployment: compose объявляет один сервис `api` без реплик; масштабирование внешними средствами не исключено. Общий replay-store (Redis/DB) является согласованным решением Stage 4, но включать его без PO-D14a не требуется. **Передаётся PO как отдельное решение** на момент включения HITL.

## 7. Smoke test — подготовка и статус

Скрипт `scripts/e2e-smoke.mjs` обновлён: проверяет публичные `/health` и `/catalog/devices`, затем fail-closed `GET /projects` без токена → 401, логин по `SMOKE_EMAIL`/`SMOKE_PASSWORD`, refresh (body fallback), `GET /auth/me` с Bearer, и только после этого прогоняет golden-dataset через защищённые project endpoints. ERP write-операции не вызываются. Требуются сервисы `api`, `postgres`, `redis`, `calc-engine` и переменные `API_URL`, `CALC_URL`, `SMOKE_EMAIL`, `SMOKE_PASSWORD`, плюс обязательные секреты и `AUTH_ALLOWED_ORIGINS`.

**Статус: NOT RUN.** `pnpm smoke:e2e` → `SMOKE FAILED: fetch failed` (API на `localhost:3000` и calc-engine на `localhost:8000` не запущены). `docker compose ps` без обязательных переменных завершается ошибкой; доступен только контейнер `vwc-stage2-pg17`. Smoke **не объявляется PASS**.

## 8. Тесты и команды

| Команда | Результат |
|---|---|
| `npx vitest run --reporter=junit …` (SHA `2274b0f`) | **196 passed / 0 failed / 0 errors** (JUnit) |
| targeting `auth-rate-limit + refresh-session + rbac-http + erp-hitl + env + bootstrap` | 75 passed |
| `VWC_PG17_URL=<isotated test DB> npx vitest run test/postgres17-refresh.test.ts` | **7 passed** (отдельный запуск, PostgreSQL 17.11) |
| `npx tsc -p apps/api/tsconfig.json --noEmit` / `tsconfig.test.json` | PASS |
| `npx tsc -p apps/api/tsconfig.json --outDir apps/api/dist` | PASS |
| `npx eslint` (изменённые зоны) | PASS |
| `pnpm --filter api exec drizzle-kit check` | Everything's fine |
| `docker compose config --quiet` (с dummy env) | COMPOSE_CONFIG_OK |
| `node --check scripts/e2e-smoke.mjs` | PASS |
| `pnpm smoke:e2e` | **NOT RUN** — fetch failed |

Полный JUnit (196) и PG17-прогон (7) — разные запуски, не суммируются.

## 9. Остаточные риски

| ID | Risk |
|---|---|
| F-05 (P2) | TEC-04 keyring/grace не реализован — ротация секрета вызовет массовый logout |
| F-06 (P2) | rollback 0003 разрушительный (DROP TABLE) |
| F-07 (P2) | PG17-тест пропускается без `VWC_PG17_URL` |
| F-08 (P2) | smoke NOT RUN на реальном стеке |
| NEW-01 (P2) | in-memory HITL replay-store при >1 инстансе — латентно до PO-D14a |
| NEW-02 (P3) | за доверенным reverse proxy `req.ip` — адрес прокси; лимит консервативен (требуется отдельное PO-решение о trust proxy) |

## 10. Границы и передача

PO-D01 остаётся ровно из четырёх публичных маршрутов; PO-D13-01, rotation/replay/family revoke, ERP fail-closed, HITL approver fail-closed, RBAC, graph write-paths и `AuthResponse` с `user` не изменены. TEC-04, бизнес-правила ERP/HITL и guest/offline не реализовывались. Merge в `main`, merge PR, tag/release, deploy и GitHub Settings/Secrets не трогались.

Код закоммичен в `integration/v091-verification` как `2274b0f8ecad842299b20bbed0f740dbc098e948`. Передаётся Agent 3 для независимой проверки.
