# BACKEND_INTEGRATION_REPORT — VoltWireCraft v0.9.1 / Agent 2

| Параметр | Значение |
|---|---|
| Repository | `iilmchat/ai-VoltWireCraft` |
| Рабочий каталог | отдельный worktree `C:/Projects/AI/ai-VoltWireCraft-integration` |
| Ветка | `integration/v091-verification` (не создавал конкурирующую ветку) |
| Исходный SHA | `4e775c3520d8299712aa3f330aeb9bcd7859c2cb` |
| Конечный SHA кода | `7f23abfe3264fba80245ac802f15aa69d6407a4a` |
| JUnit | `artifacts/junit-7f23abfe3264fba80245ac802f15aa69d6407a4a.xml` — `tests="140" failures="0" errors="0"` |
| Статус | **PARTIAL / NO-GO** — PO-блокеры и PostgreSQL-проверки не закрыты |

---

## 1. Исходный SHA и конечный SHA

- Начало: `4e775c3` — integration report Agent 1, рабочее дерево чистое.
- Код после исправлений: `7f23abf` — один коммит Agent 2.
- Отчёт фиксируется отдельным коммитом; JUnit именован SHA проверенного кода `7f23abf`.

## 2. Изменённые файлы и коммиты

Коммит `7f23abfe3264fba80245ac802f15aa69d6407a4a`:

| Файл | Изменение | Причина |
|---|---|---|
| `apps/api/src/projects/projects.service.ts` | `+ requireWriteAccessAsync(id, userId)` — ранняя write-проверка через `ProjectPolicyService` | Авторизация до LLM/calc/storage/DB write в `ai/assemble-panel` |
| `apps/api/src/projects/projects.controller.ts` | вызов `await this.service.requireWriteAccessAsync(id, user.id)` первым оператором `assemblePanelAsync` | Устранён порядок «сначала агент, потом проверка записи» |
| `apps/api/test/assemble-panel-authorization.test.ts` | **новый**; 4 сценария с реальной политикой, PGlite и spy на LLM/calc/storage/DB | Доказательство отсутствия side effects при 404/403 |
| `apps/api/test/rbac-http.test.ts` | +6 HTTP-тестов: `import-cad` и `ai/assemble-panel` × (401/403/404) | Ранее HTTP-покрытие было только у `PUT /graph` |
| `apps/api/test/agents.test.ts` | мок `requireWriteAccessAsync` + 4-й аргумент конструктора | Адаптация существующего теста к новому контракту; логика не изменена |

Не трогались: `main`, миграции, CI, Docker, frontend, чужие ветки, GitHub.

## 3. QA-DEF-04: воспроизведение до/после

**До (SHA `4e775c3`):** полный прогон — 18 файлов / **130 passed**, что совпадает с отчётом Agent 1.

Фактический код PR #2 уже содержит исправление:
- `ProjectsService.updateGraphAsync(id, graph, userId)` — `userId` обязателен;
- первой операцией вызывается `this.policy.requireEditorAsync(id, userId)` **до** валидации графа и `UPDATE`;
- `ProjectPolicyService.roleForAsync` возвращает одинаковый `NotFoundException('Проект не найден')` для отсутствующего проекта и outsider; `requireAsync` даёт `ForbiddenException` для `client` на `write`.

Доказательство (без изменения кода): `test/rbac-project-access.test.ts` с реальной политикой и PGlite:
- `projects.updateGraphAsync(PROJECT_A, graph, OUTSIDER_ID)` → `NotFoundException`, DbSnapshot до == после;
- `projects.updateGraphAsync(PROJECT_A, graph, CLIENT_ID)` → `ForbiddenException`, DbSnapshot до == после;
- `projects.getByIdAsync(PROJECT_B, OWNER_ID)` → 404;
- global admin без membership → 404.

**Почему Agent 1 счёл риск открытым (причины, подтверждённые кодом):**
1. `test/projects.service.spec.ts` подменяет `ProjectPolicyService` на always-allow и, более того, **не попадает в прогон**: include Vitest — `test/**/*.test.ts`, `src/**/*.test.ts`; файл `.spec.ts` не запускается. Видимый «юнит-тест графа» не доказывает авторизацию.
2. В интегрированном отчёте требование сформулировано как «прямой DI-вызов может обойти», но проверка прав опиралась на косвенные тесты; явного негативного теста на `updateGraphAsync` с реальной политикой в основном наборе не было до `rbac-project-access.test.ts`.
3. Остаётся остаточный риск: `userId` — обычная строка; доверенный внутренний код может подменить identity. Ни один call-site в репозитории не берёт `userId` из тела/параметров запроса (все — `@CurrentUser()`), но типа «trusted principal» нет.

**После:** `7f23abf` — 140 тестов, 0 падений. Переписывать исправление PR #2 не потребовалось; добавлены только ранняя проверка для assembly и доказательные тесты.

## 4. Все четыре graph write-paths

| # | Путь | Файл / метод | Аутентификация | Membership/роль | Отказ без записи | Owner/Engineer | Client/outsider |
|---|---|---|---|---|---|---|---|
| 1 | `PUT /projects/:id/graph` | `projects.controller.ts:95` `@ProjectScoped(role:'write')`; `projects.service.ts updateGraphAsync` | `SecurityGuard` → JWT | `ProjectAccessGuard` + `policy.requireEditorAsync` в сервисе | `rbac-http.test.ts`: 401/403/404 → `writeSpy` 0; `rbac-project-access.test.ts`: DbSnapshot ровный | HTTP 200 + 1 запись (engineer) | 403 / 404 |
| 2 | `POST /projects/:id/import-cad` | `projects.controller.ts:187` `@ProjectScoped(role:'write')`; `projects.service.ts:295` `importCadAsync` | тот же | guard + `policy.requireEditorAsync` **до** `parseDxfAsync` | новые HTTP-тесты: сервис не вызван; сервисный тест: `calcDxf` spy 0, БД не изменена | успех в сервисных тестах предыдущего кода; HTTP-тест успеха с валидным DXF не добавлен | 403 / 404 |
| 3 | `POST /projects/:id/ai/assemble-panel` | `projects.controller.ts:234` `@ProjectScoped(role:'write')`; новый метод `requireWriteAccessAsync` | тот же | guard + ранняя проверка в контроллере и повторная в `updateGraphAsync` | новый `assemble-panel-authorization.test.ts`: LLM=0, storage=0, DB write=0 | 4-й тест: agent 1 вызов, write 1 вызов | 403 / 404 |
| 4 | Прямой DI-вызов | `projects.service.ts updateGraphAsync(id, graph, userId)` | нет HTTP | `policy.requireEditorAsync` первой строкой | `rbac-project-access.test.ts`: 404/403, DbSnapshot + SpyBank | успех в `projects.service.spec.ts` (политика подменена моком, файл не запускается в vitest) | 404 / 403 |

Ограничение пути 4: identity передаётся строкой; злонамеренный доверенный код может подставить чужой `userId`. Это остаточный риск, требующий trusted-principal контекста (PO/архитектура), но внешний вызывающий не может повлиять на `userId` — все call-site используют `@CurrentUser()`.

## 5. AI assembly side-effect evidence

Тест `test/assemble-panel-authorization.test.ts` вызывает контроллер напрямую (guards обойдены) с реальной политикой и PGlite:

| Сценарий | Результат | LLM/calc spy | Storage spy | DB write spy / snapshot |
|---|---|---:|---:|---|
| Outsider | `NotFoundException` (404) | 0 | 0 | 0; снимок идентичен |
| Client | `ForbiddenException` (403) | 0 | 0 | 0; снимок идентичен |
| Engineer | `success: true` | 1 | 0 | 1 |
| Owner | `success: true` | 1 | 0 | 1 |

Отдельный сценарий «ошибка после успешной авторизации» (например, сбой LLM/БД) не смешивался с отказами доступа. HTTP-тесты дополнительно подтверждают 401/403/404 до вызова контроллера.

## 6. ERP route inventory и PO-D05 зависимости

| Маршрут | Декоратор | Сервис | Фактическая операция |
|---|---|---|---|
| `GET /integrations/status` | нет `@ProjectScoped` | `statusAsync` | только статус MCP, без проектных данных |
| `POST /projects/:id/lighting/calculate` | `role:'read'` | `getByIdAsync` → calc-engine | чтение графа + расчёт |
| `POST /projects/:id/integrations/moysklad/check-stock` | `role:'read'` | `getByIdAsync` + `checkStockAsync` | чтение BOM + MCP read |
| `POST /projects/:id/integrations/moysklad/create-order` | **`role:'read'`** | `createOrderAsync` → `assertUserContext`, `policy.requireReadAsync`, HITL | внешняя запись заказа |
| `POST /projects/:id/integrations/bitrix24/send-estimate` | **`role:'read'`** | `sendEstimateAsync` → тот же путь | внешняя запись сметы |

**Конфликт:** два write-маршрута помечены `role:'read'`; `IntegrationService` проверяет только membership, не роль. Участник с ролью `client` и валидным HITL-токеном теоретически может выполнить ERP write. HITL-токен привязан к `sub`, `projectId`, `action`, `itemsHash`, `exp`, `jti` (`HitlService`), но `confirmedBy` не проверен политикой — PO-D14a открыт.

**Минимальное решение PO (не принято мной):** явно указать роли для `create_order` и `send_estimate` (например, `owner|engineer` либо отдельная роль), а также определить, кто может быть `confirmedBy`. Пока PO-D05/D14a открыты, роль **не назначена** — код не менялся, чтобы не подменить бизнес-решение.

## 7. Проверка comments и остальных service-level writes

| Операция | Защита | Тест |
|---|---|---|
| `addCommentAsync` | `policy.requireReadAsync` до `INSERT` | outsider → 404, строка не создана; client → комментарий создан |
| `resolveCommentAsync` | `policy.requireReadAsync` до `UPDATE`, фильтр по `projectId` | outsider → 404, статус не изменён; client → resolve разрешён |
| `addMemberAsync` | `policy.requireOwnerAsync` | outsider → 404, engineer → 403 |
| `uploadFloorPlanAsync` | `policy.requireEditorAsync` до `storage.saveAsync` | client → 403, storage spy 0, БД не изменена |
| `importCadAsync` | `policy.requireEditorAsync` до `parseDxfAsync` | client → 403, calc spy 0, БД не изменена |
| `calculateAsync`, `short-circuit`, `selectivity-tcc`, `lighting` | `getByIdAsync` → `requireReadAsync` | BOLA-тест чтения чужого проекта → 404 |

Остаток: `uploadFloorPlanAsync` сохраняет файл до `INSERT` в БД; при ошибке БД возможен orphan-файл (транзакции file+DB нет). Это отдельный дефект v0.9.1, не смешивался с отказами доступа.

## 8. Результаты тестов

| Проверка | SHA | Результат |
|---|---|---|
| Полный API suite до изменений | `4e775c3` | 18 файлов / 130 passed / 0 failed |
| Целевые тесты после изменений | `7f23abf` | 3 файла / 36 passed |
| Полный API suite после изменений | `7f23abf` | 19 файлов / **140 passed / 0 failed** |
| JUnit | `7f23abf` | `tests="140" failures="0" errors="0"` |
| `pnpm --filter api typecheck` | `7f23abf` | PASS |
| `pnpm --filter api build` | `7f23abf` | PASS |
| `npx eslint` (5 изменённых файлов) | `7f23abf` | PASS |

PostgreSQL 17 + pgvector **не запускался**; все authorization-тесты — PGlite.

## 9. Список оставшихся дефектов

1. PO-D05 / PO-D14a — роли ERP/CRM и полномочия HITL approver; `role:'read'` на двух write-маршрутах.
2. PO-D13 — модель refresh-сессий и миграция `0003` (не трогал).
3. PO-D03 / PO-D04 / PO-D06 — guest mode, legacy `owner_id=NULL`, создание проекта Client.
4. Реальная PostgreSQL 17 + pgvector не проверена; concurrency refresh и migration validation не выполнены.
5. Orphan-файл при ошибке БД после `storage.saveAsync`.
6. `userId` как plain string — нет trusted principal; внутренний код может подменить identity.
7. `test/projects.service.spec.ts` (`.spec.ts`) не попадает в include Vitest — ложное ощущение покрытия.
8. `main` не тронут; PR не открывался; merge/release/deploy не выполнялись.

## 10. Итог PASS / PARTIAL / FAIL

| Задача | Итог | Комментарий |
|---|---|---|
| 1. QA-DEF-04 | **PARTIAL** | Исправление PR #2 реально и доказано; early-auth добавлен только для assembly; остаточный риск подмены `userId` |
| 2. Четыре graph write-paths | **PASS (с оговоркой)** | Все 4 пути имеют проверки и тесты; путь 4 — residual identity spoofing |
| 3. AI assembly side-effects | **PASS** | 4 сценария с spy, 0 побочных эффектов при отказе |
| 4. ERP write-маршруты | **PARTIAL / BLOCKED (PO-D05)** | Инвентарь и конфликт зафиксированы; роль не назначена |
| 5. Comments и service writes | **PASS** | Все проверки на уровне сервиса, negative side-effect тесты |
| Тестирование / сборка | **PASS** | 140/140, typecheck, build, lint |
| PostgreSQL acceptance | **FAIL / NOT EXECUTED** | Окружение не поднято |
| Release Gate | **NO-GO** | Требуется независимый QA и решение PO |

---

*Остановиться до merge/release. Дальнейшие действия — по решению PO.*
