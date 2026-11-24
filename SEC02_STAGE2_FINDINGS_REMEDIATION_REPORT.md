# SEC02_STAGE2_FINDINGS_REMEDIATION_REPORT

**Агент:** Agent 2
**Дата:** 2026-11-24
**Ветка:** `integration/v091-verification`
**Проверенный исходный SHA:** `ede9b8fb415681b8c44d7fb0c3b5138af506ac7f`
**SHA коммита исправлений:** `bff9217e863067597809791ccf6385dd5a73a540` — `fix(api): remediate SEC-02 stage 2 review findings S2-01/03/04/05`
**Разрешение:** исправлены S2-01 (P1), S2-03 (P2), S2-04 (P2), S2-05 (P3); S2-02 закрыт через обязательную проверку PostgreSQL 17 (отдельный раздел задания).
**Ограничения:** merge в `main`, release/tag/deploy, GitHub Settings — не изменялись. PO-D01, PO-D05, PO-D14a, guest/offline и SEC-01/SEC-02 семантика не пересматривались.

---

## 1. Сводка по findings

| ID | Статус | Изменения | Доказательства |
|---|---|---|---|
| S2-01 (P1) | **Исправлен** | `meta/0003_snapshot.json`, `meta/_journal.json`, `0003_refresh_sessions.sql` | `drizzle-kit generate` → `No schema changes, nothing to migrate`; journal = 4 записи; snapshot `prevId = e3cb253d…` (0002), `id = e2d68d61…`; дублирующих SQL/миграций нет |
| S2-02 (P1, PG17) | **Исправлен (проверен)** | новый `test/postgres17-refresh.test.ts` | PostgreSQL **17.11**, 7/7 тестов PASSED, включая `FOR UPDATE`, partial UNIQUE, rollback/reapply, replay, mid-transaction failure, atomic registration |
| S2-03 (P2) | **Исправлен** | `test/refresh-session.test.ts`, `test/postgres17-refresh.test.ts` | fault injection **внутри** транзакции (после consumed / после подстановки replaced_by); rollback без half-state; PGlite + PG17 |
| S2-04 (P2) | **Исправлен** | `auth.service.ts`, `refresh-session.service.ts`, тесты | `registerAsync` оборачивает INSERT user + session + refresh в одну транзакцию; сбой после user оставляет БД чистой |
| S2-05 (P3) | **Исправлен** | `auth.controller.ts`, тесты | `/auth/refresh` возвращает `AuthResponse` (`accessToken`, `refreshToken`, `user`) — в соответствии с планом `BACKEND_IMPLEMENTATION_PLAN.md:338-353`; TX- и cookie-сценарии проверены |

---

## 2. S2-01 — Drizzle snapshot

Действия:
1. Средствами Drizzle Kit (`pnpm exec drizzle-kit generate --name 0003_refresh_sessions`) создан snapshot, соответствующий текущей Drizzle-схеме (9 таблиц, включая `public.auth_sessions` и `public.auth_refresh_tokens`).
2. Сгенерированный snapshot принят как `apps/api/src/database/migrations/meta/0003_snapshot.json`; его `prevId` исправлен на `e3cb253d-b781-4a13-9c27-32672c82e93b` (ID snapshot 0002), `id = e2d68d61-31eb-49b8-b4d3-8c19711dc579`.
3. Временные файлы (`0004_*`, `--custom`-артефакты) удалены; `_journal.json` содержит ровно 4 корректные записи (idx 0–3, tag `0003_refresh_sessions`).
4. SQL `0003_refresh_sessions.sql` заменён Drizzle-сгенерированным DDL для тех же двух таблиц (дублирующей миграции не создано).

Проверка:
```
$ pnpm --filter api exec drizzle-kit generate
9 tables ...
No schema changes, nothing to migrate 😴
```
Дополнительно: `pnpm --filter api db:migrate` на чистой БД PG17 → EXIT=0; созданы все 9 таблиц, включая обе новые.

---

## 3. S2-03 — отказ внутри транзакции

Добавлен test DB adapter `failingAfter(db, operation, nth)`: внутри реальной транзакции он считает `insert`/`update` и выбрасывает исключение на N-м вызове (после того как предыдущие запросы уже выполнены).

Тесты (PGlite, `refresh-session.test.ts`):
- отказ на `insert` нового refresh — старый токен остаётся активным, `consumed_at`/`replaced_by_token_id` пусты, сессия не отозвана;
- отказ на втором `update` (установка `replaced_by_token_id`) — новый токен не остаётся, half-state отсутствует.

Тест на PostgreSQL 17 (`postgres17-refresh.test.ts`) повторяет mid-transaction failure на реальном Drizzle-пуле. Результат: транзакция откатывается, состояние БД совпадает с исходным.

---

## 4. S2-04 — атомарная регистрация

- `RefreshSessionService.issueAsync(userId, executor = this.db)` теперь принимает executing client; при регистрации передаётся `tx`.
- `AuthService.registerAsync` выполняет `INSERT users → issueAsync(session+refresh)` **в одной транзакции**. Публичный контракт (`AuthResponseSchema`, username/password/displayName) не изменён; `loginAsync` работает как прежде.
- Тест: `failingAfter(db,'insert',2)` (отказ на вставке сессии после пользователя) → `registerAsync` отвергается, `SELECT users WHERE email=…` пуст, лишних сессий нет. Аналогичный тест выполнен на PG17.

---

## 5. S2-05 — контракт refresh

Решение: `/auth/refresh` возвращает **AuthResponse с `user`** (минимальное согласованное изменение), потому что:
- approve-план `BACKEND_IMPLEMENTATION_PLAN.md:338-353` определяет ответ refresh с полем `user`;
- `AuthResponseSchema` — единственный существующий контракт авторизации в `packages/shared`;
- frontend пока не вызывает `/auth/refresh`, поэтому обратной несовместимости нет; будущий browser/Tauri-клиент получает знакомую форму.

`AuthController.refreshAsync` теперь валидирует ответ через `AuthResponseSchema` и берёт пользователя из БД по `sub` из refresh-контекста. Добавлены два теста (body/Tauri и cookie/browser), проверяющие presence `user` и прохождение схемы. PO-D01 не расширен.

---

## 6. PostgreSQL 17 — обязательная проверка

Среда: контейнер `vwc-stage2-pg17`, образ `pgvector/pgvector:pg17`, изолированная БД `vwc_stage2_test` (отдельная БД `vwc_stage2_migrate` для проверки раннера). Использованы случайные тестовые учётные данные, не production secrets.

```
PostgreSQL 17.11 (Debian 17.11-1.pgdg12+2) on x86_64-pc-linux-gnu
$ pnpm --filter api exec vitest run test/postgres17-refresh.test.ts
Test Files 1 passed (1), Tests 7 passed (7)
```

Проверено:
- применение `0000–0003` и `db:migrate` на чистой БД (EXIT=0, 9 таблиц);
- rollback 0003 (`DROP TABLE`) и повторное применение;
- partial UNIQUE `auth_refresh_tokens_active_per_session` (вторая активная запись отклонена);
- параллельный refresh с `SELECT ... FOR UPDATE`: ровно один успех, второй отказ + `revoke_reason='replay'`;
- replay и отзыв всей family;
- mid-transaction failure без half-state;
- атомарность регистрации при отказе после INSERT пользователя.

**PGlite не объявляется эквивалентом PostgreSQL 17** — все PG17-утверждения получены на реальном сервере 17.11.

---

## 7. Регрессии

```
pnpm --filter api typecheck              exit 0
pnpm --filter api build                  exit 0
pnpm --filter api lint                   exit 0
pnpm --filter api exec vitest run (JUnit)
  tests=188 failures=0 errors=0 skipped=0
JUnit: C:\Users\Z1\AppData\Local\Temp\sec02-findings-junit.xml
```

Покрыты и остаются зелёными: PO-D01 exact allowlist (4 публичных маршрута, refresh не публичный), AUDIT-01, AUDIT-02, ERP fail-closed, HITL, refresh/replay/concurrency, все graph write-paths, 404/403-семантика.

---

## 8. Изменённые файлы

- `apps/api/src/auth/auth.controller.ts` — refresh возвращает AuthResponse с user; HttpCode 200.
- `apps/api/src/auth/auth.service.ts` — транзакционная регистрация.
- `apps/api/src/auth/refresh-session.service.ts` — `issueAsync` с executor; комментарии S2-04.
- `apps/api/src/database/migrations/0003_refresh_sessions.sql`, `meta/_journal.json`, `meta/0003_snapshot.json`.
- `apps/api/test/refresh-session.test.ts` — S2-03/04/05.
- `apps/api/test/postgres17-refresh.test.ts` — новый PG17-набор.

---

## 9. Остаточные ограничения

| Ограничение | Уровень |
|---|---|
| TEC-04 key rotation/grace не реализован | P2 |
| Rate limiting refresh/logout отсутствует | P1 |
| Cookie-CSRF зависит от `AUTH_ALLOWED_ORIGINS` (без дефолтов) | P1 |
| Rollback 0003 удаляет данные сессий | P2 |
| PG17-тест требует `VWC_PG17_URL` и запущенного контейнера | P2 |
| Smoke/E2E на реальных сервисах NOT RUN (нет api/calc-engine) | P2 |

---

## 10. Передача

SHA исправлений: `bff9217e863067597809791ccf6385dd5a73a540`. Итоговый HEAD ветки сообщается PO в финальном ответе. Передаётся Agent 3 для security review, затем Agent 4 для QA. Merge/release/tag/deploy не выполнялись.
