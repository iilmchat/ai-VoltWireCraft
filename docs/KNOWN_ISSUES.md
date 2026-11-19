# Известные проблемы VoltWireCraft

Файл ведётся с версии 0.1.0 (ноябрь 2026).
Формат: `KI-XXX` — название, приоритет, статус, файлы.

Приоритеты: 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low
Статусы: Open / In Progress / Fixed / Documented / Deferred / Won't Fix / Resolved

---

## Реестр

### KI-001 — Две схемы графа в пакете `shared` 🟠 High · Fixed (2026-11-19)

**Проблема.** В `@voltwirecraft/shared` сосуществовали два контракта графа:
фронтенд-совместимая схема в `src/index.ts` / `src/graph.ts` (`floorPlan`,
`rooms`, `devices`, `routes`) и бэкенд-контракт `BackendProjectGraphSchema`
(`version`, `nodes`, `edges` с `cable`). Это нарушало Graph-First (RULES § 5.2).

**Решение.** Удалены `src/graph.ts` и `src/cable.ts`. Единственная каноническая
`ProjectGraphSchema` зафиксирована в `src/graph.schema.ts` по DESIGN_V010 § 3.1:
`floorPlan`, `rooms`, `walls`, `nodes` (11 типов УГО), `edges` с `cableSpecs`,
`VwcFileSchema`. `src/index.ts` — чистый реэкспорт. API, клиент и `.vwc`
используют одну и ту же модель и типы из неё.

**Файлы.** `packages/shared/src/graph.schema.ts`, `packages/shared/src/index.ts`,
`apps/api/src/database/schema.ts`, `apps/web/src/store/`.

---

### KI-002 — Миграции проверены на PGlite, а не на реальном PostgreSQL 17 🟡 Medium · Resolved (2026-11-19)

**Проблема.** В среде разработки Docker Desktop установлен, но демон Docker не
запущен, поэтому поднять PostgreSQL 17 + pgvector не удалось.

**Решение.** В `.github/workflows/ci.yml` добавлен сервисный контейнер
`pgvector/pgvector:pg17`; job `Node` после тестов выполняет `db:migrate`,
`db:seed` и `db:seed:normatives` с реальным `DATABASE_URL`. Таким образом
сгенерированные Drizzle-миграции (включая `CREATE EXTENSION vector` и HNSW),
сид каталога и загрузка нормативных чанков проверяются на целевой БД при каждом
push и pull request. Локальные интеграционные тесты на PGlite сохранены как
быстрая проверка.

**Файлы.** `.github/workflows/ci.yml`, `apps/api/src/database/migrations/`,
`apps/api/src/database/seed-catalog.ts`, `apps/api/src/database/seed-normatives.ts`.

---

### KI-003 — Координаты графа хранятся в пикселях подложки 🟡 Medium · Deferred (v0.3.0)

**Проблема.** RULES § 5.3 требует хранить длины в базовых единицах СИ. Граф
хранит координаты в пикселях (`positionPx`, `waypointsPx`, `polygonPx`) и
масштаб `scaleMetersPerPx`; физические длины получаются умножением на масштаб
в расчётном ядре.

**Обоснование.** Пиксельная привязка к подложке необходима для 2D-редактора;
перевод в метры выполняется детерминированно в `calc-engine`. Спецификация
миграции `schemaVersion: 1 → 2` зафиксирована в `DESIGN_V020` § 3.1.1, но
сама миграция перенесена на `v0.3.0`: в `v0.2.0` приоритет отдан расчётному
ядру, щиту НКУ, однолинейной схеме и ИИ-агентам. Физические длины при этом
всегда вычисляются в СИ, поэтому неверных результатов расчёта нет.

**Файлы.** `packages/shared/src/graph.schema.ts`, `apps/calc-engine/app/calculator.py`,
`docs/development/v0.2/DESIGN_V020_CALC_AND_AI_AGENTS.md` § 3.1.1.

---

### KI-004 — Цены в спецификации не синхронизированы с API-каталогом 🟡 Medium · Deferred (v0.3.0)

**Проблема.** `BillOfMaterialsTable` и `lib/bomExport.ts` берут цены из
локальных констант (`CABLE_PRICE_RUB_PER_M`, `DEVICE_PRICE_RUB`), а не из
таблицы `catalog_devices`, доступной через API. При изменении прайса в
каталоге спецификация показывает устаревшую стоимость.

**Обоснование.** В `v0.2.0` каталог используется для подбора оборудования и
компоновки щита; подключение актуальных цен к экспорту CSV/XLSX перенесено
на `v0.3.0` вместе с версионированием прайса и валюты.

**Файлы.** `apps/web/src/lib/bomExport.ts`, `apps/web/src/components/BillOfMaterialsTable.tsx`,
`apps/api/src/database/schema.ts`.

---

## Сводка реестра

| Статус | Количество |
|---|---|
| Open | 0 |
| In Progress | 0 |
| Fixed | 1 |
| Documented | 0 |
| Deferred | 2 |
| Won't Fix | 0 |
| Resolved | 1 |
| **Всего** | **4** |

> Сводка пересчитана поиском по файлу перед правкой (RULES § 3.9).
