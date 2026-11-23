# ADR — Security Architect TEC-02…TEC-13 (VoltWireCraft v0.9.1)

**Ветка:** `feat/v091-security-core`
**Baseline:** `91436bd` (включает stage-0 DI-фикс Backend Architect), исходный `main @ 5348bfc`
**Статус:** решения архитектора; PO-решения не подменяются.

---

## TEC-05 — HITL-токен (РЕАЛИЗОВАНО)

**Решение.** Отдельный от JWT формат `<base64url(payload)>.<base64url(HMAC-SHA256)>` с ключом `HITL_SIGNING_KEY`. Payload: `typ='hitl'`, `sub`, `confirmedBy`, `projectId`, `action`, `itemsHash`, опционально `dealId`, `iat`, `exp`, `jti`. TTL ≤ 300 с, `jti` одноразовый через интерфейс `ReplayStore`. Проверка привязки к `sub`, `projectId`, `action`, `itemsHash`, `dealId` и подписи в константное время.

**Компромисс.** `confirmedBy` не проверяется по роли внутри сервиса — PO-D14a (кто полномочен подтверждать) и PO-D05 (роли ERP) открыты. Проверка полномочий остаётся в этапе 3/4 и не принимается мной за PO.

**Production-ограничение.** `InMemoryReplayStore` пригоден только для unit-тестов/одного процесса. В этапе 4 подключается Redis/DB реализация с тем же интерфейсом; до этого HITL-сервис **не используется** в рантайме (модуль не импортирован в `AppModule`).

**Файлы:** `src/security/hitl.service.ts`, `src/security/replay-store.ts`, `src/security/security.module.ts`.

## TEC-06 — service-to-service (РЕАЛИЗОВАНО как криптографическая основа)

**Решение.** `INTERNAL_SERVICE_TOKEN` (≥32 символов), токен формата `<body>.<HMAC-SHA256>` с `typ='internal-service'`, `iss='voltwirecraft-api'`, `sub`, `aud`, `iat`, `exp` (≤300 с), `jti`. Проверка `aud` обязательна. Контракт заголовка для этапа 4: `X-Internal-Service-Token: <token>`; FastAPI должен проверять через `hmac.compare_digest`.

**Компромисс.** mTLS не внедряется: требуется PKI (DevOps); токен + сетевая изоляция — v0.9.1. Входящая проверка в FastAPI — этап 4, поэтому сейчас токены только выпускаются/проверяются в тестах, без включения в рантайм.

**Файлы:** `src/security/internal-token.service.ts`.

## TEC-07 — pepper (РЕАЛИЗОВАНО)

**Решение.** `JWT_REFRESH_HASH_PEPPER` обязателен в production и не должен совпадать с `JWT_SECRET` (проверка в `validateEnv`). Хеш refresh: `HMAC-SHA256(token, pepper)`. На этапе 2 pepper используется для хеширования; в этой ветке только валидируется.

## TEC-02 — транспорт refresh (РЕШЕНО, реализация этапа 2 заблокирована PO-D13)

**Решение.** Primary: `HttpOnly; Secure; SameSite=Strict` cookie; body `refreshToken` — fallback для Tauri/тестов. `AuthResponseSchema` не меняется. access — только в памяти клиента. CSRF: same-origin `/api` proxy в проде либо `SameSite=None; Secure` + CSRF-токен; Origin/Content-Type проверка. Реализация зависит от PO-D13 (модель сессий) и PO-D03 (гостевой режим) — не выполняется в этой ветке.

## TEC-03 — параллельные refresh (РЕШЕНО, реализация этапа 2)

Один winner (200), второй запрос — 401 + отзыв всей family, без grace. UX-риск снижается single-flight на клиенте (этап 5). Обоснование: SEC-02 прямо требует отзыва при повторном использовании; grace ослабил бы требование.

## TEC-04 — keyring/grace (ОТКРЫТО, НЕ РЕАЛИЗОВАНО)

Внедрено только обязательное поле `kid` в header с проверкой на `JWT_KID` (один активный ключ). Поддержка `previous` ключа и grace (15 мин для access / 30 дней для refresh) **не реализована**: решение зависит от Tech Lead (TEC-14 — выбор `jose`) и требует уведомления PO об операционном риске. Тесты `S1-JWT-14/15` остаются `BLOCKED`.

## TEC-08 / TEC-10 / TEC-12 / TEC-13 (РЕШЕНО, реализация этапа 2 заблокирована PO-D13)

- TEC-08: мгновенный отзыв access через проверку `sid` (family) в БД при каждом запросе; Redis-denylist — альтернатива v0.9.2.
- TEC-10: ошибка БД при ротации → откат транзакции, family **не** отзывается, generic 500.
- TEC-12: старый access после refresh действует до своего `exp` (≤15 мин), если family активна.
- TEC-13: logout отзывает текущую сессию (= family); `logout-all` — все family пользователя.

## Реализованные в этой ветке решения этапа 0

- `APP_GUARD` в `AuthModule`: `JwtAuthGuard` → `GraphEditGuard`; порядок зафиксирован meta-тестом.
- `@Public()`/`IS_PUBLIC_KEY` определены, но **не применены ни к одному маршруту**: PO-D01 (точный allowlist) открыт, поэтому система fail-closed (без токена → 401 везде).
- `GraphEditGuard` перенесён с class-level `@UseGuards` на APP_GUARD с `@RequireGraphWrite()` на трёх путях записи графа (`PUT /graph`, `import-cad`, `ai/assemble-panel`) — без окна беззащитности. В этапе 3 заменяется `@ProjectScoped({role:'write'})` (Backend Architect).
- `email`/`role` исключены из JWT; пользователь и роль загружаются из БД в `JwtAuthGuard`.

## Не принятые решения PO (сознательно не подменяются)

PO-D01 allowlist, PO-D03 guest/offline, PO-D13 модель сессий, PO-D05 роли ERP, PO-D14a (полномочия подтверждающего HITL), PO-D04 legacy-проекты, PO-D06 создание проекта Client.
