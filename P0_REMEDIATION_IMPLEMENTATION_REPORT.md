# P0_REMEDIATION_IMPLEMENTATION_REPORT — VoltWireCraft v0.9.1

| Параметр | Значение |
|---|---|
| Ветка | `integration/v091-verification` |
| Исходный HEAD | `bc42bd9e1726565f7d14e8e08042493964f615dc` |
| Конечный SHA кода | `4ee7c1a0c4befb7b75439d9199a0125594075c04` |
| JUnit | `artifacts/junit-4ee7c1a0c4befb7b75439d9199a0125594075c04.xml` — `tests="160" failures="0" errors="0"` |
| Merge / release / deploy / GitHub Settings | не выполнялись |

---

## 1. Изменённые файлы

Коммит `4ee7c1a`:

| Файл | Изменение |
|---|---|
| `apps/api/src/integrations/integrations.controller.ts` | `create-order` и `send-estimate`: `@ProjectScoped({param:'id', role:'write'})` вместо `role:'read'`; read-only `check-stock`/`lighting` оставлены `read` |
| `apps/api/src/integrations/integration.service.ts` | Внедрён `HitlService`; сервисная проверка `requireEditorAsync`; реальная проверка HITL до MCP; fail-closed gating; канонический `itemsHash`; выравнивание MCP-аргументов |
| `apps/api/src/integrations/erp-mcp.service.ts` | Путь `/mcp/tools/{tool}`, плоский payload, разбор `ToolEnvelope{success,tool,data,message}`, отказ при `success:false` |
| `apps/api/src/integrations/integrations.module.ts` | Локальные провайдеры `HitlService` + `HITL_REPLAY_STORE` (без импорта `InternalTokenService`) |
| `apps/api/src/agents/agents.module.ts` | Те же провайдеры — `AgentsModule` тоже инстанцирует `IntegrationService` |
| `apps/api/test/erp-hitl-integration.test.ts` | **новый**: 20 тестов (service-level, HTTP и контракт API↔MCP) |
| `apps/api/test/integrations.test.ts` | Обновлён под новую защиту: произвольный токен не должен достигать MCP; обновлены ожидания имени/payload `get_stock`; добавлен мок `HitlService` |
| `apps/api/test/rbac-project-access.test.ts`, `test/app.bootstrap.test.ts` | Добавлены обязательные провайдеры/env для `HitlService` при сборке реальных модулей |

Не трогались: `projects.service.ts`, `projects.controller.ts`, `assemble-panel-authorization.test.ts`, `rbac-http.test.ts`, `main`, миграции, публичный allowlist.

## 2. AUDIT-02 — ERP write fail-closed

- HTTP: `@ProjectScoped(role:'write')` на обоих write-маршрутах — Client получает 403 на уровне guard.
- Service: `createOrderAsync`/`sendEstimateAsync` вызывают `policy.requireEditorAsync(projectId, userId)` до любой внешней операции; outsider → 404, Client → 403 при прямом DI-вызове.
- **Дополнительное ограничение PO-D05 соблюдено:** введён `assertErpWritesEnabled()`, который безусловно бросает `ForbiddenException` для **всех** ролей, включая Owner и Engineer. Существующее право `write` не трактуется как разрешение на финансовую операцию. Механизм — константа в коде с явной ссылкой на PO-D05; после решения PO достаточно заменить эту точку, не меняя остальную логику.
- Read-only `check-stock` и `lighting/calculate` сохранены с `role:'read'` и работают.

## 3. AUDIT-01 — HITL

- `HitlService.verifyAsync` вызывается в `assertHitlAsync` **до** `ErpMcpService.callToolAsync`: проверяются подпись, `sub`, `projectId`, `action`, `itemsHash`, `dealId` (для send-estimate), `exp`, `jti`/replay.
- Дополнительно проверяются `verified.sub === userId`, непустой `confirmedBy`, отсутствие `dealId` для `create_order`.
- **PO-D14a соблюдено:** endpoint выпуска HITL-токенов **не создан**; self-confirmation не внедрялась; Owner/Engineer не назначаются approver; новый механизм делегирования не создан. `assertApproverAuthority()` fail-closed: даже корректный токен отвергается до отдельного решения PO. Произвольная строка из тела отвергается уже на этапе проверки подписи.
- `HitlService` подключён через локальные провайдеры в `IntegrationsModule` и `AgentsModule` — без импорта `SecurityModule`/`InternalTokenService` (иначе потребовался бы `INTERNAL_SERVICE_TOKEN` во всех окружениях).

## 4. API ↔ MCP

| Аспект | Было | Стало |
|---|---|---|
| Путь | `/tools/{tool}` | `/mcp/tools/{tool}` (соответствует FastAPI) |
| `get_stock` | `get_stock`, `{items}` | `moysklad_check_stock`, `{skus}` |
| `create_order` | `create_order`, `{items}` | `moysklad_create_customer_order`, `{projectTitle, items}` |
| `send_estimate` | `send_estimate`, `{dealId, items}` | `bitrix24_add_bom_to_deal`, `{dealId:Number, title, totalRub, itemsSummary}` |
| Envelope | `{arguments:{...}, confirmationToken}` | плоский payload `{...args, confirmationToken}` |
| Ответ | `{result, operationId}` | `ToolEnvelope{success, tool, data, message}`; `success:false` → `BadGatewayException`; `operationId` генерируется клиентом |

Контрактный тест проверяет точный `pathname`, плоский body и валидацию `data`, а также отказ при `success:false` — не только HTTP 200.

## 5. Тесты и доказательства

Полный прогон: **20 файлов / 160 тестов / 0 падений**. `typecheck`, `build`, `eslint` изменённых зон — PASS. JUnit сохранён для SHA `4ee7c1a`.

Сценарии из `test/erp-hitl-integration.test.ts` (все отрицательные проверяют `mcpCall.not.toHaveBeenCalled()` + `DbSnapshot` до == после):

| Сценарий | Результат | MCP calls |
|---|---|---:|
| Client → create-order (service + HTTP) | 403 | 0 |
| Client → send-estimate (service + HTTP) | 403 | 0 |
| Owner/Engineer + произвольный `confirmationToken:'x'` | 401 | 0 |
| Токен с чужим `sub` | 401 | 0 |
| Токен с чужим `projectId` | 401 | 0 |
| Просроченный токен | 401 | 0 |
| Неверный `itemsHash` | 401 | 0 |
| Неверный `dealId` | 401 | 0 |
| Повторно использованный токен | 401 (второй вызов) | 0 |
| Валидный токен, Owner/Engineer → PO-D14a gate | 403 | 0 |
| Outsider → 404 | 404 | 0 |
| Read-only check-stock (Client) | 201, MCP=1 | 1 |
| Lighting calculation (Client) | 201, calc=1 | 1 |
| Контракт API↔MCP | 200, `data` валидирован | 1 |

Существующий `internal-hitl.test.ts` не считался доказательством интеграции — интеграция доказана вызовами `IntegrationService` с реальным `HitlService`.

## 6. Оставшиеся блокеры

| Блокер | Статус |
|---|---|
| **PO-D01** | Не решён. `@Public()` по-прежнему не применён; `POST /auth/login`, `/health`, `/catalog/devices` отвечают 401 (AUDIT-03). В этот PR не входил — список публичных маршрутов не выбирался. |
| **PO-D05** | Не решён. ERP write закрыты для всех ролей; роль/матрица не назначалась. |
| **PO-D14a** | Не решён. Approver не назначен; выпуск подтверждений через API отсутствует; `assertApproverAuthority()` fail-closed. |
| **PO-D13** | Не решён. Сессии/миграция `0003` не создавались. |
| Инфраструктура | In-memory `ReplayStore` однопроцессный — перед multi-instance нужен общий Redis/DB; входящая аутентификация MCP/calc-engine (TEC-06) не реализована; реальная PostgreSQL 17 + pgvector не использовалась (тесты на PGlite). |

## 7. Известные ограничения

- `projectTitle` и `totalRub` в MCP-payload сейчас берутся из `projectId` и `0` — в отсутствие PO-решения о финансовых полях это признано заглушкой; write-операции всё равно закрыты.
- `HitlService.issue` используется только в тестах для подготовки токенов; публичного эндпоинта выпуска нет по прямому запрету PO-D14a.
- Файл `P0_REMEDIATION_PLAN.md` (неотслеживаемый) и прежний JUnit-артефакт не изменялись.

---

**Остановиться и передать SHA `4ee7c1a` Agent 3 для независимой проверки. Merge в main не выполнялся.**
