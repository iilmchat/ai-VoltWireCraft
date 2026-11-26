# SEC02_STAGE2_IMPLEMENTATION_REPORT — refresh session lifecycle

**Агент:** Agent 2
**Дата:** 2026-11-24
**Разрешение:** PO-D13-01 APPROVED без изменений (24.11.2026)
**Ветка:** `integration/v091-verification`
**Исходный SHA:** `bd4e48728a7dd18529430098c19b69416a4caa61`
**Конечный SHA коммита реализации:** `e12b15cda9fcac66f83542b684b6fad8f71a6439` — `feat(api): SEC-02 stage 2 refresh session lifecycle`.
**Ограничения соблюдены:** merge в `main`, release/tag, deploy, GitHub Settings/Secrets/branch protection не изменялись; PO-D01, PO-D05, PO-D14a, guest/offline, ERP fail-closed не пересматривались.

---

## 1. Миграция и схема

**Миграция:** `apps/api/src/database/migrations/0003_refresh_sessions.sql`, зарегистрирована в `meta/_journal.json` (idx 3, `0003_refresh_sessions`).

Созданы таблицы:

| Таблица | Поля | Ограничения |
|---|---|---|
| `auth_sessions` | `id` (sid), `user_id`, `created_at`, `last_used_at`, `revoked_at`, `revoke_reason` | FK → `users(id) ON DELETE CASCADE` |
| `auth_refresh_tokens` | `id` (jti), `session_id`, `token_hash`, `issued_at`, `expires_at`, `consumed_at`, `replaced_by_token_id`, `revoked_at` | FK → `auth_sessions(id) ON DELETE CASCADE`, self-FK `replaced_by_token_id ON DELETE SET NULL`, UNIQUE(`token_hash`), индекс по `session_id`, **partial UNIQUE index** на `session_id WHERE consumed_at IS NULL AND revoked_at IS NULL` |

Гарантии: не более одного активного refresh на сессию; история потреблённых токенов сохраняется для replay-детекшна; сырые refresh-токены в БД не пишутся (только HMAC-SHA256 с `JWT_REFRESH_HASH_PEPPER`).

**Rollback (документированный, проверен в PGlite):**
```sql
DROP TABLE IF EXISTS "auth_refresh_tokens";
DROP TABLE IF EXISTS "auth_sessions";
```
Проверка: до drop таблицы есть, после — отсутствуют, повторное применение `0003` восстанавливает обе таблицы. **Внимание:** rollback удаляет все сессии и историю refresh — пользователи будут разлогинены; migration down не сохраняет данные.

Drizzle-схема обновлена (`authSessions`, `authRefreshTokens` добавлены в `schema`, self-reference через `AnyPgColumn`, partial unique index через `.where(sql...)`).

---

## 2. JWT и lifecycle

- `JwtPayload` расширен полем `sid` (обязателен, UUID); `jti` остаётся обязательным.
- `JwtService.signAccess(userId, sid)` и `signRefresh(userId, sid, jti)` теперь привязаны к сессии; refresh `jti` = ID записи `auth_refresh_tokens`.
- Claims: `sub, sid, typ, aud, iss, iat, nbf, exp, jti`; HS256, обязательный `kid`, access `vwc-api`/15m, refresh `vwc-auth`/30d — сохранено из SEC-01.
- JwtAuthGuard после `verify(...,'access')` вызывает `RefreshSessionService.assertSessionActiveAsync(payload.sid)`; при отозванной сессии **или любой ошибке БД** → 401 (fail-closed).
- Старые JWT без `sid` не мигрируются: после внедрения требуется повторная авторизация.
- `JWT_REFRESH_HASH_PEPPER` обязателен для сервиса сессий (отдельный от `JWT_SECRET`, проверка несовпадения уже была в env schema).

---

## 3. Endpoints и SecurityGuard

| Метод | Маршрут | Режим | Код |
|---|---|---|---|
| POST | `/auth/register` | `@Public()` (PO-D01) | 201 |
| POST | `/auth/login` | `@Public()` (PO-D01) | 201 |
| GET | `/auth/me` | обычный JWT + активная сессия | 200/401 |
| POST | `/auth/refresh` | `@RefreshAuth()` — **НЕ** `@Public()` | 200/401 |
| POST | `/auth/logout` | обычный JWT, отзыв текущей `sid` | 200/401 |
| POST | `/auth/logout-all` | обычный JWT, отзыв всех сессий пользователя | 200/401 |

- `SecurityGuard` (единственный `APP_GUARD`) сначала проверяет `REFRESH_AUTH_KEY`; для refresh вызывает `RefreshGuard`, для всех остальных — `JwtAuthGuard → ProjectAccessGuard`. Порядок и семантика обычных guards не изменены.
- `RefreshGuard` проверяет: `content-type: application/json`, источник токена (cookie primary / body fallback), подпись, `typ`, `aud`, `iss`, `kid`, `sub`, `sid`, `jti`, срок, соответствие записи БД и активность сессии.
- Access-токен не принимается как refresh и наоборот (тесты).
- Meta-тест подтверждает: обычных публичных методов **ровно 4**, `POST /auth/refresh` в них не входит, имеет отдельную метку, соседние методы (`me`, `logout`) метку не наследуют.

**Ротация (TEC-03):** транзакция → `SELECT ... FOR UPDATE` сессии и токена → проверка → пометка старого `consumed_at` → вставка нового токена → `replaced_by_token_id` → `last_used_at` → commit. Grace period отсутствует. Повторное предъявление использованного токена отзывает всю family (`revoke_reason='replay'`), причём отзыв фиксируется в БД **до** выброса 401. Параллельный запрос: один 200, второй 401 + отзыв семьи (тест).

**TEC-10:** при ошибке БД внутри транзакции исключение пробрасывается, транзакция откатывается, сессия не отзывается, частичные записи не остаются (тест с `failingDb.transaction`).

**InMemoryReplayStore** не используется для refresh — остаётся механизмом HITL.

---

## 4. Cookie, CSRF, клиенты

- Primary transport: cookie `vwc_refresh` с `HttpOnly; Secure; SameSite=Strict; Path=/auth`; TTL = `JWT_REFRESH_EXPIRES_IN`. Cookie недоступна JavaScript.
- Body `refreshToken` — fallback для Tauri и тестов; требует `application/json`.
- CSRF: cookie-транспорт принимается только при `Origin` из `AUTH_ALLOWED_ORIGINS` (новая опциональная переменная, **без production defaults**). Без сконфигурированных origins cookie-refresh fail-closed (401); body-fallback продолжает работать.
- Логирование refresh-токена, cookie и секретов не добавлено; `sanitizeLogValue` из SEC-01 сохранён.
- `AuthResponseSchema` **не изменён**; frontend `apiClient.ts` и `authStore.ts` не трогались, Tauri/body-сценарий проверен тестом. Access-токен по-прежнему хранится только в памяти клиента (frontend не сохраняет его в localStorage).
- Smoke (`scripts/e2e-smoke.mjs`) не изменялся: он использует body `login` и `response.ok`, контракт совместим.

---

## 5. Результаты проверок

Команды (SHA реализации):

```
pnpm --filter api typecheck     # exit 0
pnpm --filter api build         # exit 0
pnpm --filter api lint          # exit 0
pnpm --filter api exec vitest run
# 21 файл, 176 тестов, 0 failed, 0 skipped
pnpm --filter api exec vitest run --reporter=junit --outputFile=$TEMP/sec02-stage2-junit.xml
# junit: tests=176 failures=0 errors=0 skipped=0
```

Новый файл `apps/api/test/refresh-session.test.ts` — **15/15 PASSED**:

1. register/login создают сессию и одну активную refresh-запись;
2. hash-only storage (сырой токен отсутствует в БД);
3. HTTP login выставляет HttpOnly/Secure/SameSite=Strict/Path=/auth cookie;
4. refresh без токена → 401;
5. body-fallback выдаёт новую пару;
6. cookie без Origin/с чужим Origin → 401, с разрешённым → 200;
7. access как refresh и refresh как Bearer → 401;
8. неверные `kid/typ/aud/iss/sub/sid/jti`/подпись → 401;
9. replay → 401 + отзыв семьи + новый токен не работает;
10. logout отзывает только текущую сессию;
11. logout-all отзывает все сессии пользователя, не чужие;
12. parallel refresh → ровно один 200, второй 401 + отзыв семьи;
13. TEC-10 — ошибка БД → rollback, сессия активна, лишних токенов нет;
14. expired refresh → 401 (fake timers);
15. миграция 0003 up/down/up на PGlite.

**Реальный PostgreSQL 17:** **NOT RUN** — Docker daemon недоступен (`docker info` → `failed to connect to the docker API ... npipe`). Конкурентная блокировка и DDL проверены только на PGlite.

**Smoke/E2E:** **NOT RUN** — сервисы `api:3000` и `calc-engine:8000` не запущены на стенде. Контракт совместим (AuthResponseSchema без изменений, body-fallback покрыт тестом).

---

## 6. Сохранность предыдущих решений

- **PO-D01:** мета-тест «ровно четыре публичных маршрута» остался в `security-guard-order.test.ts` и расширен проверкой, что `/auth/refresh` не публичный; 4/4 без изменений. `/integrations/status`, `/auth/me` остаются закрытыми.
- **AUDIT-01/AUDIT-02:** файлы `HitlService`, `InternalTokenService`, `ReplayStore`, `SecurityModule`, `integrations/*` не изменялись; `erp-hitl-integration.test.ts` и `security-architect/internal-hitl.test.ts` проходят в общем прогоне 176/176.
- **ERP fail-closed до PO-D05, HITL authority до PO-D14a, guest/offline** — не трогались.

---

## 7. Изменённые файлы

**Новые:** `refresh-auth.decorator.ts`, `refresh-session.service.ts`, `refresh.guard.ts`, `migrations/0003_refresh_sessions.sql`, `test/refresh-session.test.ts`.

**Изменённые:** `auth.controller.ts`, `auth.guard.ts`, `auth.module.ts`, `auth.service.ts`, `jwt.service.ts`, `security.guard.ts`, `config/env.schema.ts`, `database/schema.ts`, `migrations/meta/_journal.json`, `test/{app.bootstrap,auth,erp-hitl-integration,rbac-http,rbac-project-access,security-guard-order}.test.ts`, `test/security-architect/sec01-guards.test.ts`.

---

## 8. Остаточные риски и ограничения

| Риск | Уровень | Комментарий |
|---|---|---|
| TEC-04 key rotation/grace не реализован | P2 | один активный `kid`, смена ключа = массовый logout |
| CSRF cookie зависит от `AUTH_ALLOWED_ORIGINS` | P1 | без конфигурации cookie-refresh недоступен (fail-closed); body-fallback работает |
| Replay без grace period | P1 | одобрено TEC-03: повтор отзывает всю семью |
| Rate limiting refresh/logout отсутствует | P1 | не входило в PO-D13-01 |
| Body-fallback требует, чтобы клиент не сохранял refresh в JS-хранилище | P1 | ответственность frontend/Tauri |
| Реальный PostgreSQL NOT RUN | P1 | конкурентные `FOR UPDATE` проверены только на PGlite |
| Smoke NOT RUN | P2 | нет запущенных сервисов |
| Миграция 0003 down удаляет данные сессий | P2 | документировано, не является безопасным для прод-данных без бэкапа |

---

## 9. Передача

SHA коммита реализации: `e12b15cda9fcac66f83542b684b6fad8f71a6439`. Дальнейшие шаги: независимый review Agent 1, затем security QA Agent 3/4. Merge в `main`, release, tag и deploy **НЕ выполнялись**.
