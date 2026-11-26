# SECURITY_INTEGRATION_REPORT — VoltWireCraft v0.9.1

**Автор:** Security Integration Lead (Agent 1)
**Дата:** 2026-11-23
**Ветка:** `integration/v091-verification` (отдельный worktree `C:\Projects\AI\ai-VoltWireCraft-integration`)
**Режим:** merge commits без переписывания истории; merge в `main`, release, tags, deploy, GitHub Settings/Secrets не выполнялись.

---

## 1. Baseline и точные SHA

| Объект | SHA |
|---|---|
| Baseline `main` | `5348bfcee7547344550fdfc08938cf5b6a5affe9` |
| PR #1 `feat/v091-security-core` (head) | `0ad083fd1ca87c38a45ac55fcf3787c2fd4f2784` |
| PR #2 `feat/v091-rbac-hardening` (head) | `bea97e67e28a7e44a455c2ae9af14ef2abf7a55e` |
| Integration branch перед исправлениями | `75e3e74` (после двух merge) |
| Integration branch после исправлений | `fea9b9c` |

Baseline проверен через `git rev-parse HEAD main`; PR-head — через `gh pr view 1/2 --json headRefOid`.

**Статус раздела: PASS.**

---

## 2. Состав PR #1 и PR #2

### PR #1 — Security Core (2 коммита)

| Коммит | Content |
|---|---|
| `91436bd` | DI-фикс stage 0: `graph-edit.guard.ts`, `projects.module.ts`, `app.bootstrap.test.ts` |
| `0ad083f` | SEC-01: `env.schema.ts`, `jwt.service.ts`, `auth.guard.ts`, `auth.module.ts`, `auth.service.ts`, `auth.controller.ts`, `project-access.controller.ts`, `public.decorator.ts`, `graph-write.decorator.ts`, `all-exceptions.filter.ts`, `projects.controller.ts`, `src/security/*`, `docker-compose.yml`, `.env.example`, CI, secret scanner, тесты, ADR |

### PR #2 — RBAC Hardening (`bea97e6`)

- Новые `project-access.guard.ts`, `project-scoped.decorator.ts`, `policy/policy.module.ts`, `policy/project-policy.service.ts`.
- Изменены `app.module.ts`, `projects.controller.ts`, `projects.service.ts`, `calc-proxy.controller.ts`, `integrations.controller.ts`, `integration.service.ts`, `agents/tools.ts`, `project-access.service.ts`, тесты RBAC.
- Обеспечивает `@ProjectScoped({param,role})` на проектных маршрутах и 404/403-семантику.

**Статус раздела: PASS** (оба PR присутствуют в итоговой ветке: `git log main..HEAD`).

---

## 3. Merge / conflict log

| Шаг | Результат |
|---|---|
| `git worktree add -b integration/v091-verification <path> 5348bfc` | Изолированная ветка от baseline; чужие незакоммиченные файлы main-worktree не затронуты |
| `git merge --no-ff 0ad083f` | **Clean merge**, merge commit `1ffa467` |
| `git merge --no-ff bea97e6` | Авто-merge всех файлов, кроме `apps/api/src/projects/projects.controller.ts` |
| Конфликт | Мой временный `@RequireGraphWrite()` (PR #1, bridge этапа 0) против финального `@ProjectScoped({param:'id',role:'write'})` (PR #2) в импорте и на трёх маршрутах (`PUT /graph`, `import-cad`, `ai/assemble-panel`) |
| Решение | Взята версия PR #2 (`git checkout --theirs`), так как `@ProjectScoped` — финальная политика; мой bridge удалён из контроллера. `graph-write.decorator.ts` и `GraphEditGuard` оставлены неиспользуемыми для совместимости |
| Дополнительные правки интеграции | Адаптирован `rbac-http.test.ts`: вместо отдельного `APP_GUARD` теперь подменяется `JwtAuthGuard` внутри единого `SecurityGuard` |
| Итоговый merge commit | `75e3e74` |

История не переписывалась, force push/reset/rebase не применялись.

**Статус раздела: PASS.**

---

## 4. Реальный порядок guards и способ его гарантирования

### Проблема

PR #1 регистрировал `JwtAuthGuard` и `GraphEditGuard` как `APP_GUARD` в `AuthModule`; PR #2 регистрировал `ProjectAccessGuard` как `APP_GUARD` в `PolicyModule`. `AppModule` импортирует `PolicyModule` **перед** `AuthModule`, поэтому порядок globals guards в разных модулях не гарантирован.

### Решение (commit `fea9b9c`)

- Добавлен единый `apps/api/src/auth/security.guard.ts`:

```ts
public async canActivate(context: ExecutionContext): Promise<boolean> {
  const authenticated = await this.jwt.canActivate(context);       // 1
  if (!authenticated) return false;
  return this.projectAccess.canActivate(context);                  // 2
}
```

- `AuthModule`: единственный `{ provide: APP_GUARD, useClass: SecurityGuard }`.
- `PolicyModule`: удалена регистрация `APP_GUARD`, оставлены провайдер/экспорт `ProjectAccessGuard`.
- `GraphEditGuard` выведен из глобальной цепочки (заменён `@ProjectScoped({role:'write'})`).

Порядок зафиксирован **в коде**, а не в порядке импорта модулей. `ProjectAccessGuard` дополнительно fail-closed: если `request.user` отсутствует → 401 (`project-access.guard.ts:47-49`).

### Доказательство

Интеграционный тест `test/security-guard-order.test.ts` поднимает **реальный `AppModule`** (только `DRIZZLE_DB` подменён на PGlite) и проверяет:

| Сценарий | Ожидаемый статус | Результат |
|---|---|---|
| нет JWT | 401 | ✅ |
| невалидный JWT | 401 | ✅ |
| outsider с валидным JWT | **404** | ✅ — если бы ProjectAccessGuard выполнился раньше, был бы 401 |
| client: `PUT /graph` / `GET /projects/:id` | 403 / 200 | ✅ |
| engineer: `PUT /graph`; owner: `GET`; engineer на `/members` | 200 / 200 / 403 | ✅ |
| `ProjectAccessGuard` без `request.user` | UnauthorizedException | ✅ |
| 5 кандидатов в `@Public()` без токена | 401 | ✅ |

**Статус раздела: PASS.**

---

## 5. AppModule bootstrap и HTTP tests

| Проверка | Команда | Результат |
|---|---|---|
| Typecheck | `pnpm --filter api typecheck` | ✅ |
| Lint (изменённые зоны) | `pnpm --filter api exec eslint src/auth src/config/env.schema.ts src/policy test/...` | ✅ |
| Build | `pnpm --filter api build` | ✅ |
| Полный прогон API | `pnpm --filter api test` | **18 files, 130 passed, 0 skipped, 0 failed** |
| JUnit | `pnpm --filter api exec vitest run --reporter=junit --outputFile=<temp>/junit-integration.xml` | `tests=130 failures=0 skippedTags=0 suites=18` |

Отдельно отмечу: до интеграции (свежий merge `75e3e74`) полный прогон давал 17 files / 118 passed; после исправлений — 18 files / 130 passed. Успешная компиляция не принималась как доказательство совместимости — использованы HTTP-тесты реального `AppModule`.

**Статус раздела: PASS.**

---

## 6. Public endpoints inventory (PO-D01 открыт)

В интегрированной ветке **`@Public()` не применён ни к одному маршруту** (grep: только объявление в `public.decorator.ts` и комментарии). Следовательно, каждый из 28 маршрутов требует валидный access JWT.

| Группа | Маршруты | Без токена | Влияние PO-D01 |
|---|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | **401** | Регистрация/логин недоступны — ни один клиент не может получить токен |
| Infrastructure | `GET /health` | **401** | Compose/CI healthcheck API вернёт 401 → контейнер может быть признан unhealthy |
| Catalog | `GET /catalog/devices` | **401** | Справочник недоступен без логина |
| Integrations | `GET /integrations/status` | **401** | Статус интеграций недоступен; политика admin/public не выбрана (PO-D01.1) |
| Projects (15+ route) | все `/projects/...` | **401** | Ожидаемо; плюс `@ProjectScoped` read/write/owner |
| Прочие | calc/AI/ERP маршруты | **401** | Плюс проектная политика |

Интеграционный HTTP-тест явно проверяет 5 кандидатов: `/auth/register`, `/auth/login`, `/health`, `/catalog/devices`, `/integrations/status` — все **401**.

**Я не назначал публичные маршруты.** Варианты для PO-D01 не приняты: V1 = register+login+health+catalog; V2 = V1+integrations/status; V3 = V1 без health с отдельным `/health/live`; V4 = доп. гостевой read-only (требует PO-D03).

**Статус раздела: PARTIAL** — инвентаризация и проверка выполнены, решение PO не получено; деплой/логин заблокированы.

---

## 7. `JWT_SECRET_FILE` и production fail-fast

### Проверка дефекта

Исходная реализация (PR #1) подставляла значение из файла в `JWT_SECRET` и затем проверяла «нельзя задавать оба» — file-путь всегда отклонялся.

**Исправление (commit `fea9b9c`):** взаимное исключение проверяется на **сырых** переменных до чтения файла; после чтения `JWT_SECRET_FILE` удаляется из resolved-объекта.

### Результаты

| Проверка | Команда/тест | Результат |
|---|---|---|
| Чтение файла на чистом окружении | `NODE_ENV=production`, только `JWT_SECRET_FILE=<temp>`, остальные обязательные env заданы; `node -e import(dist/env.schema.js).validateEnv(process.env)` | `FILE_OK length=32`, exit 0 |
| Оба значения сразу | unit-тест `env.schema.test.ts` | fail-fast `/одновременно/` ✅ |
| Нечитаемый файл | unit-тест | fail-fast `/JWT_SECRET_FILE/` ✅ |
| Production без секрета | `node apps/api/dist/main.js` | exit **1**, listener не открыт ✅ |
| Production с дефолтным/dummy секретом | тот же запуск | exit **1** ✅ |
| Утечка значения в лог | поиск строки секрета в stdout/stderr | `NO_SECRET_VALUE_IN_LOG` ✅ |

**Ограничения (не расширял scope):** поддерживается только `JWT_SECRET_FILE`; `JWT_REFRESH_HASH_PEPPER_FILE`, `HITL_SIGNING_KEY_FILE`, `INTERNAL_SERVICE_TOKEN_FILE` не реализованы. Схема Docker secrets (`secrets:`, `/run/secrets`) не менялась — compose по-прежнему использует `${VAR:?}`.

**Статус раздела: PARTIAL** — `_FILE` для JWT работает и покрыт тестами; полная Docker-secrets wiring отсутствует и требует DevOps/утверждённого плана.

---

## 8. Оставшиеся дефекты и PO/TEC blockers

| ID | Описание | Владелец |
|---|---|---|
| PO-D01 | Точный allowlist публичных маршрутов; без него логин/health/catalog — 401 | Product Owner |
| PO-D13 | Модель сессий; блокирует Stage 2 (refresh, ротация, logout) | Product Owner |
| PO-D03 / PO-D05 / PO-D14a | Гостевой режим, роли ERP, полномочия подтверждающего HITL | Product Owner |
| TEC-04 / TEC-14 | Keyring/grace и выбор `jose`/`supertest` | Security Architect / Tech Lead |
| DEF-01 | ERP write-маршруты помечены `@ProjectScoped({role:'read'})` в PR #2 — уточнить по PO-D05, достаточно ли read для create-order/send-estimate | Backend Architect / PO |
| DEF-02 | Docker secrets wiring и остальные `*_FILE` переменные | DevOps |
| DEF-03 | Прямой DI-вызов `ProjectsService.updateGraphAsync(id, graph)` всё ещё без userId — PR #2 добавил проверки в HTTP-слой и часть сервисов, но прямому вызову требуется отдельная проверка | Backend Architect |
| DEF-04 | Команда `pnpm smoke:e2e` в интеграционной ветке не обновлена под Bearer (изменение осталось в другой ветке) | QA |

**Статус раздела: PARTIAL** — технические blocker'ы интеграции сняты, продуктовые/инфраструктурные остаются.

---

## 9. Список коммитов интеграционной ветки

```
fea9b9c fix(integration): deterministic guard order and JWT_SECRET_FILE validation
75e3e74 merge(pr2): integrate RBAC Hardening into verification branch
1ffa467 merge(pr1): integrate Security Core into verification branch
bea97e6 feat(api): SEC-02 project authorization and BOLA hardening
0ad083f feat(api): SEC-01 JWT hardening and stage-0 global guards
91436bd fix(api): restore AppModule DI for project guards (stage 0)
5348bfc chore(release): выпуск версии v0.9.0  (baseline)
```

Отчёт добавляется отдельным коммитом после `fea9b9c`; точный SHA отчётного коммита доступен через `git log -1`.

---

## Итоговая оценка по разделам

| Раздел | Статус | Комментарий |
|---|---|---|
| 1. Baseline/SHA | **PASS** | Все SHA зафиксированы |
| 2. Состав PR | **PASS** | Оба PR в ветке |
| 3. Merge/conflict | **PASS** | 2 merge commit, 1 конфликт решён в пользу PR #2 |
| 4. Порядок guards | **PASS** | Единый `SecurityGuard`, доказано HTTP-тестами |
| 5. Bootstrap/HTTP | **PASS** | 130/130, JUnit 0 failures |
| 6. Public inventory | **PARTIAL** | Всё 401; PO-D01 открыт |
| 7. `_FILE` / fail-fast | **PARTIAL** | JWT `_FILE` исправлен; Docker secrets не подключены |
| 8. Остальные блокеры | **PARTIAL** | PO/TEC/DevOps ожидают решений |
| 9. Список коммитов | **PASS** | Приведён выше |

**SEC-01 НЕ объявляется завершённой.** Merge в `main`, PR #1/#2 в `main`, release, tags и deploy **не выполнялись**. Рекомендуется integration-review с PO по PO-D01/PO-D13 и DevOps по DEF-02 перед каким-либо GO-решением.
