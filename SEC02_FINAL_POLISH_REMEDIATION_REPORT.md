# SEC02_FINAL_POLISH_REMEDIATION_REPORT — Agent 2

| Параметр | Значение |
|---|---|
| Ветка | `integration/v091-verification` |
| Исходный SHA | `ca23afe193b285462733daaacc917b82993158b6` |
| Кодовая ревизия | `f0c9c234fb1199d0538c86ec47a67252c7c5f04b` |
| JUnit кода | `artifacts/junit-f0c9c234fb1199d0538c86ec47a67252c7c5f04b.xml` — `tests="215" failures="0" errors="0"` |
| Smoke | **PASS** — `SMOKE OK: 437 проверок пройдено по 7 кейсам` |

---

## 1. Изменённые файлы

| Файл | Изменение |
|---|---|
| `apps/api/src/redis/redis.module.ts` | `ensureReadyAsync()` — явное подключение + ожидание `ready`, таймаут, generic error без адреса/секретов |
| `apps/api/src/main.ts` | readiness barrier до `app.listen()`; `trust proxy=false` сохранён |
| `apps/api/src/auth/auth-rate-limit.service.ts` | общий `consumeAsync`, per-account HMAC bucket, Redis outage fail-closed |
| `apps/api/src/auth/security.guard.ts` | per-account проверка для login по нормализованному email |
| `apps/api/src/auth/refresh.guard.ts` | каноническое сравнение Origin |
| `apps/api/src/config/env.schema.ts` | `normalizeOrigin`, новые лимиты и `AUTH_RATE_LIMIT_ACCOUNT_KEY`, production-валидация |
| `apps/api/test/{redis-readiness,origin-normalization,auth-rate-limit,env.schema,refresh-session}.test.ts` | новые и расширенные тесты F-09…F-12 |
| `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml` | новые переменные, обязательный account key в production, dummy для CI |
| `scripts/e2e-smoke.mjs` | авторизованный smoke + негативные проверки (invalid/revoked/replay/ERP/rate limit) |

---

## 2. F-09 — Redis cold-start

- `RedisService.ensureReadyAsync()` вызывается в `bootstrapAsync()` **до** `app.listen()`. При успешном подключении первый защищённый запрос проходит через готовый limiter; при недоступности — процесс не поднимает listener и не объявляет readiness.
- Readiness/Liveness: `/health` остаётся единственным readiness-сигналом (PO-D01 — ровно четыре публичных маршрута, новый endpoint не добавлен); пока нет listener'а — приложение не live и не ready.
- Fail-closed сохранён: любая ошибка Redis/`eval` → 429. Reconnect проверен на реальном Redis.
- Тесты: недоступный Redis при старте → отказ без адреса в сообщении; реальный Redis → первый `INCR=1`, после `disconnect()`+`ensureReadyAsync()` → `INCR=2`. Логи содержат только generic message.

## 3. F-10 — per-account login limit

- Добавлен bucket `vwc:auth:rate:login-account:<HMAC-SHA256>`; ключ — HMAC от `email.toLowerCase()` с устойчивым общим `AUTH_RATE_LIMIT_ACCOUNT_KEY` (production-обязателен). Email не попадает в Redis-ключи и логи.
- Per-IP bucket сохранён; оба bucket'а в одном Redis, совместно 사용ятся всеми инстансами. Лимиты: IP 5/900s, account 20/900s, refresh/logout 10/300s.
- Account bucket применяется и к несуществующему аккаунту — ответ всегда одинаковый 429, наличие учётки не раскрывается.
- Защита от простого account lockout: ограничение временное (окно 900 с), бессрочной блокировки нет; атакующий, исчерпавший чужой bucket, вызовет только временный throttle. Комбинация IP+account увеличивает стоимость атаки. **Остаточный риск** — целенаправленный временный DoS на известный email; требует PO-решения (CAPTCHA/доп. сигнал) до ужесточения.
- Тесты: много IP — один account; один IP — разные accounts; нормализация `Owner@Example.COM`; неизвестный/существующий аккаунт; превышение и восстановление; независимость bucket'ов; общий bucket между двумя сервисами; Redis outage.

## 4. F-11 — нормализация Origin

- `normalizeOrigin()` канонизирует `scheme://host[:port]`, приводит hostname к нижнему регистру, отбрасывает стандартные 80/443 и trailing slash, запрещает wildcard, `null`, credentials, path/query/fragment и неизвестные схемы.
- Применяется и к конфигурационным Origin (в `validateEnv` и `RefreshGuard.allowedOrigins()`), и к входящему `Origin` до сравнения. Сравнение точное, без suffix/substring matching. Fail-closed сохранён.
- Тесты: trailing slash, регистр, стандартный/нестандартный порт, другой поддомен, похожий посторонний домен, path, `null`, wildcard, запрещённый и отсутствующий Origin — зелёные.

## 5. F-12 — точная граница fault injection

- `failingAfter()` расширен таргетированием по таблице (`authRefreshTokens`) и захватом `.values()`/`.returning()`.
- F-02-тест теперь инжектирует отказ на INSERT `auth_refresh_tokens` **после** успешного INSERT `auth_sessions`; фиксирует созданный `sid`, затем доказывает отсутствие сессии с этим `sid`, отсутствие refresh-записи и неизменность общих счётчиков.
- Единый transaction executor в `issueAsync` сохранён. Тест действительно достигает границы (есть захваченный UUID сессии).

## 6. Smoke — PASS

Изолированный стек поднят через `docker compose -p vwc-final-smoke up -d --build postgres redis calc-engine api` с alternate ports (3100/8100/5439/6400) и тестовыми учётными данными; production-секреты и БД не использовались. Фактические проверки:

1. `/health` API и calc-engine → 200; публичный `/catalog/devices` → 200.
2. `GET /projects` без Bearer → 401 (fail-closed).
3. `POST /auth/login` тестовой учёткой → access+refresh.
4. Защищённые project endpoints golden-dataset → доступны с Bearer.
5. `POST /auth/refresh` → новая пара; повтор старого refresh → 401; новый refresh после отзыва family → 401.
6. `GET /auth/me` с недействительным токеном → 401; отдельная сессия → logout → `/auth/me` с её access → 401.
7. ERP write-path `create-order` с произвольным `confirmationToken` → отказ (403/404), MCP не вызывался.
8. Rate limiting через HTTP: 6-й login с одного IP → 429.
9. 7 эталонных кейсов offensive/calculation прогона → `SMOKE OK: 437 проверок`.

Тестовые контейнеры и временный Redis удалены; остался только предсуществующий `vwc-stage2-pg17` (не трогался).

## 7. Результаты тестов (разные запуски не суммируются)

| Команда | Результат |
|---|---|
| `vitest run --reporter=junit` (SHA `f0c9c23`, PG17 + Redis доступны) | **215 passed / 0 failed / 0 skipped** |
| `vitest run test/postgres17-refresh.test.ts` (PostgreSQL 17.11, `vwc_stage2_test`) | **7/7 passed** (отдельный запуск) |
| Redis readiness с реальным контейнером | **2/2 passed** (startup + reconnect) |
| `tsc -p tsconfig.json --noEmit`, `tsconfig.test.json`, build | PASS |
| `eslint` изменённых зон + smoke script | PASS |
| `drizzle-kit check` | Everything's fine |
| `docker compose config --quiet` | COMPOSE_CONFIG_OK |
| `pnpm smoke:e2e` | **PASS — 437 проверок, 7 кейсов** |

## 8. Реестр остаточных рисков

| ID | Severity | Состояние / последствие |
|---|---|---|
| F-05 | P2 | TEC-04 keyring/grace не реализован; ротация секрета = массовый logout. Открыт. |
| F-06 | P2 | Rollback 0003 разрушительный (DROP TABLE) — потеря сессий. Открыт. |
| F-07 | P2 | PG17-тест требует `VWC_PG17_URL`; в обычном прогоне пропускается. Открыт; в этом запуске инфраструктура была доступна. |
| F-08 | P2 | **Закрыт** — smoke PASS на реальном стеке. |
| NEW-01 | P2 | Per-account bucket позволяет временно затронуть чужой известный email; нужно решение PO о CAPTCHA/доп. сигналах. |
| NEW-02 | P2 | InMemoryReplayStore — латентный gap для будущего HITL; сейчас fail-closed по PO-D05/D14a. |
| NEW-03 | P3 | За reverse proxy все клиенты делят `req.ip`; требуется PO-решение о доверенном proxy. |

## 9. Границы

PO-D01 — ровно четыре публичных маршрута; PO-D13-01 двухтабличная модель, hash-only, rotation/replay/family revoke, sid-проверки, ERP/HITL fail-closed, RBAC и graph write-paths, `AuthResponse` с `user` — сохранены. TEC-04, PO-D05, PO-D14a, guest/offline не реализовывались. F-05/F-06/F-07 не закрывались самовольными архитектурными изменениями.

Код закоммичен как `f0c9c234fb1199d0538c86ec47a67252c7c5f04b`. Merge в main, merge PR, tag/release, deploy и GitHub Settings/Secrets не изменялись. Передаётся на независимую проверку.
