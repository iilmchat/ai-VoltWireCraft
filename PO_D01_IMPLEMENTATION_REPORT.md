# PO_D01_IMPLEMENTATION_REPORT — VoltWireCraft v0.9.1

**Агент:** Agent 2 (PO-D01 implementation, narrow scope)
**Дата:** 2026-11-24
**SHA, указанный PO как исходный:** `4ee7c1a0c4befb7b75439d9199a0125594075c04` — `fix(api): fail-close ERP writes and integrate HITL verification (AUDIT-01/02)`
**Фактический HEAD ветки перед работой:** `7f4b9c51e31ec0d7d99b731d89b14b3e07a00790` — docs-only commit поверх `4ee7c1a`; `4ee7c1a` является предком HEAD (`git merge-base --is-ancestor` → 0). Reset/переписывание истории не выполнялись.
**SHA коммита реализации PO-D01:** `11b80ceec7a2c44cfc4b1306dfead0c822ccac3c` — `feat(api): apply approved PO-D01 public allowlist (4 routes)`
**Ветка:** `integration/v091-verification`
**Ограничения соблюдены:** merge в `main`, release/tag, deploy, GitHub Settings/Secrets/branch protection — не изменялись. Миграции, схема БД, SEC-01/SEC-02, AUDIT-01/AUDIT-02, PO-D05/D14a/D13 не трогались.

---

## 1. Реализованный allowlist (ровно 4 маршрута)

| Метод | Маршрут | Контроллер | Строка |
|---|---|---|---|
| POST | `/auth/login` | `AuthController.loginAsync` | `apps/api/src/auth/auth.controller.ts:41` (`@Public()`) |
| POST | `/auth/register` | `AuthController.registerAsync` | `apps/api/src/auth/auth.controller.ts:27` (`@Public()`) |
| GET | `/health` | `HealthController.getHealthAsync` | `apps/api/src/health/health.controller.ts:22` (`@Public()`) |
| GET | `/catalog/devices` | `CatalogController.listAsync` | `apps/api/src/catalog/catalog.controller.ts:28` (`@Public()`) |

Метка `@Public()` применена **только к методам**, не к классам контроллеров. `@Public()` на уровне класса отсутствует — meta-тест проверяет отсутствие наследования.

---

## 2. Изменённые файлы

| Файл | Изменение |
|---|---|
| `apps/api/src/auth/auth.controller.ts` | `+import Public`, `@Public()` на `registerAsync` и `loginAsync` |
| `apps/api/src/health/health.controller.ts` | `+import Public`, `@Public()` на `getHealthAsync` |
| `apps/api/src/catalog/catalog.controller.ts` | `+import Public`, `@Public()` на `listAsync` |
| `apps/api/src/auth/public.decorator.ts` | обновлён комментарий: PO-D01 утверждён, 4 маршрута; `/auth/refresh` не публичный |
| `apps/api/test/security-guard-order.test.ts` | обновлён сценарий PO-D01; добавлен meta-тест точного allowlist и проверки AI/ERP/защищённых маршрутов |
| `scripts/e2e-smoke.mjs` | добавлена проверка `GET /catalog/devices` без Bearer |

**Не изменены:** `SecurityGuard`, `JwtAuthGuard`, `ProjectAccessGuard`, порядок guards, refresh-логика, ERP/HITL, миграции, схема БД, SEC-01/02, AUDIT-01/02.

---

## 3. Доказательство, что публичных маршрутов ровно четыре

Meta-тест в `apps/api/test/security-guard-order.test.ts` (`PO-D01 meta: публичная метка ровно на четырёх handler-ах, без наследования`):

- получает все контроллеры через `new DiscoveryService(app.get(ModulesContainer))`;
- перебирает все методы через `MetadataScanner.getAllMethodNames`;
- учитывает метку класса (`classPublic`) — таким образом наследование метки на весь контроллер было бы обнаружено;
- нормализует `MethodDecorator path` + `RequestMethod` и сравнивает отсортированный список с эталоном:

```
POST /auth/login
POST /auth/register
GET /health
GET /catalog/devices
```

- дополнительно проверяет длину === 4 и отсутствие `GET /auth/me`, `GET /integrations/status`.

Результат: **PASSED**.

---

## 4. Зафиксированные HTTP-коды

Источник: `apps/api/test/security-guard-order.test.ts`, реальный `AppModule` + PGlite, запросы без заголовка `Authorization`.

| Маршрут | Код | Пояснение |
|---|---|---|
| `POST /auth/register` | **400** | дошёл до `ZodValidationPipe` (нет тела) → guard пропустил как публичный |
| `POST /auth/login` | **400** | то же |
| `GET /health` | **200** | публичный |
| `GET /catalog/devices` | **200** | публичный |
| `GET /auth/me` | **401** | закрыт |
| `GET /auth/refresh` | **404** | в этом SHA маршрут отсутствует; логика refresh не изменялась. Отказ есть, но не 401 |
| `GET /integrations/status` | **401** | закрыт, PO-D01.1 не расширял allowlist |
| `POST /projects` | **401** | закрыт |
| `GET /projects/:id` | **401** | закрыт |
| `PUT /projects/:id/graph` | **401** | закрыт (отдельный тест `app.bootstrap.test.ts`) |
| `POST /projects/:id/ai/chat` | **401** | закрыт |
| `POST /projects/:id/ai/assemble-panel` | **401** | закрыт |
| `POST /projects/:id/ai/audit-pue` | **401** | закрыт |
| `POST /projects/:id/integrations/moysklad/check-stock` | **401** | закрыт |
| `POST /projects/:id/integrations/moysklad/create-order` | **401** | ERP write закрыт |
| `POST /projects/:id/integrations/bitrix24/send-estimate` | **401** | CRM write закрыт |

Дополнительно сохранены проверки guard order и RBAC: невалидный JWT → 401, outsider → 404, client write → 403, engineer/owner → 200/403 по матрице.

---

## 5. Тесты и доказательства

Команды (выполнены на `11b80ce`):

```
pnpm --filter api typecheck                    # exit 0
pnpm --filter api build                        # exit 0
pnpm --filter api lint                         # exit 0
pnpm typecheck:scripts                         # exit 0
node --check scripts/e2e-smoke.mjs             # exit 0
pnpm --filter api exec vitest run              # 161 tests, 0 failed, 0 skipped
pnpm --filter api exec vitest run --reporter=junit --outputFile=$TEMP/po-d01-junit.xml
# junit: tests=161 failures=0 errors=0 skipped=0
```

- Новые PO-D01-сценарии: 2 (`PO-D01: ровно четыре…`, `PO-D01 meta: …`) в `security-guard-order.test.ts`; файл целиком — 9/9 PASSED.
- JUnit-артефакт записан во временный каталог вне репозитория (`C:\Users\Z1\AppData\Local\Temp\po-d01-junit.xml`); в репозиторий артефакты не добавлялись.
- **Smoke (`pnpm smoke:e2e`) НЕ запускался**: на стенде нет запущенных `api:3000` и `calc-engine:8000` (проверка подключения — отказ). Синтаксис скрипта и typecheck scripts проверены; в smoke добавлена проверка публичности `/catalog/devices`. Требуется прогон QA на среде с сервисами.

---

## 6. Сохранность AUDIT-01/AUDIT-02

`git diff 4ee7c1a..11b80ce --name-only` содержит только:

```
apps/api/src/auth/auth.controller.ts
apps/api/src/auth/public.decorator.ts
apps/api/src/catalog/catalog.controller.ts
apps/api/src/health/health.controller.ts
apps/api/test/security-guard-order.test.ts
scripts/e2e-smoke.mjs
```

Файлы ERP/HITL (`HitlService`, `InternalTokenService`, `ReplayStore`, `SecurityModule`, `integrations/*`), миграции и схема БД не изменялись. AUDIT-01/AUDIT-02 считаются сохранёнными; их собственные тесты (`erp-hitl-integration.test.ts`, `security-architect/*`) входят в прогон 161/161.

---

## 7. Остаточные блокеры (не решались)

| ID | Статус |
|---|---|
| PO-D05 | Открыт — роли ERP/CRM не определены; ERP-запись остаётся закрытой для анонима и не расширена |
| PO-D14a | Открыт — полномочия HITL approver не определены; логика `confirmationToken` не трогалась |
| PO-D13 | Открыт — модель refresh-сессий/миграция 0003 отсутствует; `/auth/refresh` в этом SHA нет |
| PO-D01.1 | `/integrations/status` остаётся закрытым (в утверждённый allowlist не входит) |
| Guest/offline | Не вводился |

---

## 8. Передача

SHA коммита реализации: **`11b80ceec7a2c44cfc4b1306dfead0c822ccac3c`** (ветка `integration/v091-verification`).
Настоящий отчёт добавляется следующим docs-коммитом; итоговый HEAD ветки сообщается PO в финальном ответе для передачи Agent 4.
