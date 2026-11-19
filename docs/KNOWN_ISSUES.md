# Известные проблемы VoltWireCraft

Файл ведётся с версии 0.1.0 (ноябрь 2026).
Формат: `KI-XXX` — название, приоритет, статус, файлы.

Приоритеты: 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low
Статусы: Open / In Progress / Fixed / Documented / Deferred / Won't Fix / Resolved

---

## Реестр

### KI-001 — Две схемы графа в пакете `shared` 🟠 High · Open

**Проблема.** В `@voltwirecraft/shared` сосуществуют два контракта графа:
фронтенд-совместимая схема в `src/index.ts` / `src/graph.ts` (поля `floorPlan`,
`rooms`, `devices`, `routes`) и канонический бэкенд-контракт в
`src/graph.schema.ts` (поля `floorPlans`, `roomZones`, `nodes`, `edges`).
Web-редактор и бэкенд пока используют разные проекции.

**Влияние.** Требуется адаптер или миграция web-стора на каноническую схему;
до этого API и редактор обмениваются графами через преобразование.

**Файлы.** `packages/shared/src/index.ts`, `packages/shared/src/graph.ts`,
`packages/shared/src/graph.schema.ts`, `apps/web/src/store/`.

---

### KI-002 — Миграции проверены на PGlite, а не на реальном PostgreSQL 17 🟡 Medium · Documented

**Проблема.** В среде разработки Docker Desktop установлен, но демон Docker не
запущен, поэтому поднять PostgreSQL 17 + pgvector не удалось.

**Митигация.** Сгенерированная Drizzle-миграция применяется в
интеграционных тестах к PGlite (PostgreSQL-совместимый WASM-движок).
Перед релизом требуется повторить `pnpm --filter api db:migrate` на реальной
БД из `docker-compose.yml`.

**Файлы.** `apps/api/src/database/migrations/`,
`apps/api/test/projects.service.spec.ts`.

---

### KI-003 — Координаты графа хранятся в пикселях подложки 🟡 Medium · Documented

**Проблема.** RULES § 5.3 требует хранить длины в базовых единицах СИ. Граф
хранит координаты в пикселях (`positionPx`, `waypointsPx`, `polygonPx`) и
масштаб `scaleMetersPerPx`; физические длины получаются умножением на масштаб
в расчётном ядре.

**Обоснование.** Пиксельная привязка к подложке необходима для 2D-редактора;
перевод в метры выполняется детерминированно в `calc-engine`. Требуется
пересмотреть формулировку RULES § 5.3 или добавить метрические координаты
в следующей версии схемы.

**Файлы.** `packages/shared/src/graph.schema.ts`, `apps/calc-engine/app/calculator.py`.

---

## Сводка реестра

| Статус | Количество |
|---|---|
| Open | 1 |
| In Progress | 0 |
| Fixed | 0 |
| Documented | 2 |
| Deferred | 0 |
| Won't Fix | 0 |
| Resolved | 0 |
| **Всего** | **3** |

> Сводка пересчитана поиском по файлу перед правкой (RULES § 3.9).
