# V091_CI_JUNIT_GATE_COMPLETENESS_REMEDIATION_REPORT — Agent 2

| Параметр | Значение |
|---|---|
| Repository / branch | `iilmchat/ai-VoltWireCraft`, `integration/v091-verification` |
| Исходный SHA | `28b95144532cab1e75f054b78d332208e912556f` |
| Implementation commit | `f37c37798c2b6bb14266437daa12862abc506f69` |
| CI run implementation commit (`push`) | https://github.com/iilmchat/ai-VoltWireCraft/actions/runs/45618792642 |
| JUnit implementation run | `tests=215 failures=0 errors=0 skipped=0`, 25 suite |
| Gate regression в CI | **27 passed** |

---

## 1. Изменённые файлы

| Файл | Изменение |
|---|---|
| `scripts/assert-ci-junit.mjs` | Manifest `SUITE_MANIFEST` с `{suiteName, minTests}`; testcase-level skipped; строгая обработка entity/DOCTYPE/ошибок чтения; результаты считаются только у `<testcase>`; пустое имя testcase отклоняется |
| `scripts/assert-ci-junit.test.mjs` | Регрессионный набор расширен до 27 тестов, включая empty/partial suite, testcase skipped, `&nbsp;`, DOCTYPE, `system-out`, directory read error |

Запретные зоны не изменены: JWT/RBAC/security/business logic, API, БД, compose/Dockerfiles, PostgreSQL/Redis инфраструктура, xlsx/LibreDWG, GitHub Settings/Secrets, merge/release/tag/deploy не выполнялись.

---

## 2. Manifest 25 suite с minTests

Источник: baseline JUnit **artifact ID `15014845219`**, run `45597733577`, commit `28b9514…`, 215 testcase / 25 suite. Значения `minTests` равны фактическим baseline-count каждой suite; увеличение разрешено, уменьшение — FAIL.

| suiteName | minTests |
|---|---:|
| test/agents.test.ts | 7 |
| test/app.bootstrap.test.ts | 3 |
| test/assemble-panel-authorization.test.ts | 4 |
| test/auth-rate-limit.test.ts | 11 |
| test/auth.test.ts | 6 |
| test/calc-engine.client.test.ts | 4 |
| test/catalog-and-calculation.test.ts | 5 |
| test/copilot-chat.test.ts | 5 |
| test/env.schema.test.ts | 16 |
| test/erp-hitl-integration.test.ts | 20 |
| test/golden-dataset.test.ts | 15 |
| test/health.controller.test.ts | 2 |
| test/integrations.test.ts | 9 |
| test/origin-normalization.test.ts | 10 |
| test/postgres17-refresh.test.ts | 7 |
| test/rbac-http.test.ts | 11 |
| test/rbac-project-access.test.ts | 21 |
| test/redis-readiness.test.ts | 2 |
| test/refresh-session.test.ts | 21 |
| test/security-architect/internal-hitl.test.ts | 6 |
| test/security-architect/sec01-guards.test.ts | 8 |
| test/security-guard-order.test.ts | 9 |
| test/seed-normatives.test.ts | 5 |
| test/v03-integration.test.ts | 6 |
| test/v09-integration.test.ts | 2 |

Сумма = 215. `REQUIRED_SUITES` сохранён как производный список имён для обратной совместимости.

---

## 3. Что исправлено в gate

### HIGH — пустая обязательная suite
Раньше suite с `tests="0"` и нулём `<testcase>` проходила при согласованных totals. Теперь каждая обязательная suite проверяет `cases.length >= minTests` **и** `suite.tests >= minTests`; увеличение числа тестов не ломает gate.

### MEDIUM — testcase-level skipped
У каждого `<testcase>` проверяется атрибут `skipped` и прямой дочерний `<skipped/>`:
- `skipped="1"` без тега → FAIL;
- `<skipped/>` без атрибута → FAIL;
- `<skipped/>` + `skipped="0"` → FAIL;
- `skipped="0"` без тега → PASS;
- обычный testcase → PASS.
Согласованность skipped между root/suite/testcase сохранена.

### LOW — XML robustness
- `XMLValidator.validate` + `try/catch` вокруг чтения и разбора → контролируемый exit 1 вместо uncaught `EISDIR`/external-entity exception;
- DOCTYPE и внешние entity явно запрещены до разбора; `processEntities:false`, `htmlEntities:false` — XXE-риск устранён;
- неопределённые entity (`&nbsp;`) и одиночный `&` → FAIL;
- `<failure>/<error>/<skipped>` считаются только как прямые result elements `<testcase>`, поэтому `<system-out><skipped/></system-out>` не создаёт ложный FAIL;
- пустое имя `<testcase>` → FAIL;
- новые suite разрешены, но участвуют во всех общих проверках целостности.

---

## 4. Результаты regression-тестов

Локально и в CI: `pnpm exec vitest run scripts/assert-ci-junit.test.mjs` — **27/27 passed**.

Покрытые сценарии: valid 215/0/0 PASS; exact minimum PASS; increased count PASS; missing file FAIL; read error (directory) FAIL; empty file FAIL; malformed XML FAIL; missing root FAIL; missing PG/Redis/обычный suite FAIL; **empty required suite с согласованными totals FAIL**; **partial suite loss below minTests FAIL**; **testcase skipped="1" без тега FAIL**; **тег без атрибута FAIL**; **тег + skipped="0" FAIL**; skipped="0" без тега PASS; system-out не создаёт ложный FAIL; `&nbsp;` FAIL; DOCTYPE FAIL; tests=0 FAIL; mismatched totals FAIL; failures FAIL; errors FAIL; suite skipped tag/attr FAIL; пустое имя testcase FAIL; truncated fake-root FAIL.

Все фикстуры создаются в `mkdtemp` и удаляются в `afterAll`; реальный CI-артефакт не модифицируется.

---

## 5. Полная проверка

| Проверка | Результат |
|---|---|
| Gate regression suite | 27 passed |
| Полный API suite с PG17.12 + Redis (`artifacts/junit-gate-completeness.xml`) | **215 passed / 0 failed / 0 skipped**, 25 suite |
| PG17 suite отдельно | 7/7 |
| Redis readiness отдельно | 2/2 |
| Gate на локальном JUnit | `tests=215 failures=0 errors=0 skipped=0 suites=25`, PASSED |
| `pnpm --filter api typecheck`, `pnpm typecheck:scripts`, `pnpm --filter api build` | PASS |
| `eslint`, `check-secrets`, YAML validation | PASS |
| CI integration job run `45618792642` (SHA `f37c377…`) | success, event `push`; gate regression 27 passed; JUnit 215/0/0; gate PASSED |

---

## 6. Остаточные риски

- **CI-E (вне scope):** общий `ci.yml` красный из-за `pnpm audit` (xlsx) и сборки calc-engine (LibreDWG/libplot). Гейты не ослаблены.
- Redis image `redis:7-alpine` остаётся плавающим; закрепление по digest требует отдельного PO-решения.
- Нет лимита размера JUnit-файла; baseline ~59 КБ, потенциальный риск DoS при очень большом артефакте не закрыт.
- При открытом PR из integration-ветки возможен двойной integration-прогон (push + workflow_call); это дублирование, не false PASS.
- Manifest фиксирует текущий минимум; осознанное удаление тестов требует обновления `SUITE_MANIFEST` с документированным обоснованием.

---

Merge в main, PR merge, release/tag, deploy и GitHub Settings/Secrets не изменялись. Implementation commit `f37c37798c2b6bb14266437daa12862abc506f69` передан на независимую проверку Agent 3.
