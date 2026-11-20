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

### KI-003 — Координаты графа хранятся в пикселях подложки 🟡 Medium · Fixed (2026-11-19)

**Проблема.** RULES § 5.3 требует хранить длины в базовых единицах СИ. Граф
хранит координаты в пикселях (`positionPx`, `waypointsPx`, `polygonPx`) и
масштаб `scaleMetersPerPx`; физические длины получаются умножением на масштаб
в расчётном ядре.

**Решение.** В `packages/shared/src/graph.schema.ts` добавлена каноническая
схема `ProjectGraphSchema` (`schemaVersion: 2`) с обязательными `waypointsM`
в рёбрах; функции `migrateProjectGraphV1ToV2` / `parseVwcFile` автоматически
мигрируют проекты v1 при чтении `.vwc` и с сервера. Web использует каноническую
схему и мигратор, новые линии создаются сразу с метрическими координатами.
Пиксельные координаты остаются свойством холста.

**Файлы.** `packages/shared/src/graph.schema.ts` (мигратор и тесты),
`apps/web/src/lib/persistence.ts`, `apps/web/src/store/editorStore.ts`,
`docs/development/v0.3/DESIGN_V030_CAD_SHORT_CIRCUIT_DESKTOP.md`.

---

### KI-005 — DWG требует внешний ODA-конвертер 🟡 Medium · Fixed (2026-11-20)

**Проблема.** Нативный парсер `ezdxf` читает только DXF. Файлы DWG принимались
эндпоинтом `POST /projects/:id/import-cad`, но отклонялись до настройки
внешнего конвертера.

**Решение.** В `calc-engine` добавлен конвейер `DWG → DXF → ezdxf`: приоритет
`ODA_CONVERTER_PATH`, затем `dwg2dxf` из PATH; `subprocess.run` со списком
аргументов, без `shell=True`, таймаутом 30 с и очисткой временной директории.
API передаёт `.dwg` в ядро без отклонения. Покрыто мок-тестами успеха,
таймаута и отсутствия конвертера (RULES § 5.5).

**Файлы.** `apps/calc-engine/app/cad_parser.py`, `apps/calc-engine/app/main.py`,
`apps/api/src/projects/projects.service.ts`, `apps/calc-engine/tests/test_dwg_converter.py`.

---

### KI-004 — Цены в спецификации не синхронизированы с API-каталогом 🟡 Medium · Fixed (2026-11-19)

**Проблема.** `BillOfMaterialsTable` и `lib/bomExport.ts` берут цены из
локальных констант (`CABLE_PRICE_RUB_PER_M`, `DEVICE_PRICE_RUB`), а не из
таблицы `catalog_devices`, доступной через API. При изменении прайса в
каталоге спецификация показывает устаревшую стоимость.

**Решение.** Добавлен клиент `GET /catalog/devices` с Zod-валидацией и кэшем
в `uiStore` (TTL 5 минут, ручное обновление кнопкой «Обновить прайс»).
`BillOfMaterialsTable` и `bomExport.ts` используют реальные артикулы и цены
каталога, а при недоступности API (офлайн-Tauri) переключаются на встроенный
справочник. Цены и артикулы попадают в CSV/XLSX.

**Файлы.** `apps/web/src/lib/catalogClient.ts`, `apps/web/src/store/uiStore.ts`,
`apps/web/src/lib/bomExport.ts`, `apps/web/src/components/BillOfMaterialsTable.tsx`.

---

### KI-006 — Образ `minio/minio:latest` недоступен в части registry 🟡 Medium · Fixed (2026-11-20)

**Проблема.** При запуске полного стека в Docker часть registry возвращает ошибку
получения образа `minio/minio:latest`, из-за чего контейнер объектного
хранилища не стартует и блокирует подъём зависимых сервисов.

**Решение.** Сервис `minio` вынесен в опциональный Docker Compose profile `s3`.
Базовая команда `docker compose up -d` поднимает только пять обязательных
сервисов (`postgres`, `redis`, `calc-engine`, `api`, `web`) с
`STORAGE_DRIVER=local`; образ MinIO больше не нужен для старта. Для S3 нужно
явно запустить `docker compose --profile s3 up -d` и переключить
`STORAGE_DRIVER=s3`. Проверено: `docker compose config --services` возвращает
пять сервисов по умолчанию и шесть с профилем `s3`, базовый стек поднимается
без ошибок.

**Файлы.** `docker-compose.yml`, `.env.example`,
`apps/api/src/projects/storage/floor-plan-storage.ts`.

---

### KI-007 — Трёхфазный режим ввода из `meta` не передаётся в `PanelArchitectAgent` 🟡 Medium · Fixed (2026-11-20)

**Проблема.** Агент сборки щита использовал 230 В / 1 фазу по умолчанию:
топология ввода из `ProjectGraph.meta` и узла `input_source` не читалась,
3P/4P-аппараты и балансировка L1/L2/L3 не учитывались.

**Решение.** Топология (`supplyTopology`, `panelPoles`, `specs.phase/voltageV`)
передаётся в `POST /v1/calc/auto-panel`; мощные приборы > 2 кВт делятся на
пофазные подгруппы, жадная балансировка дополнена локальным поиском — перекос
на кейсе `02_apartment_3room_400v` составляет 3,47 % (≤ 15 %). Вводные аппараты
3P/4P, реле напряжения и УЗО 4P типа `S` 100/300 мА подбираются из каталога.

**Файлы.** `apps/api/src/agents/panel-architect.agent.ts`, `apps/api/src/agents/tools.ts`,
`apps/api/src/database/catalog-seed-data.ts`, `apps/calc-engine/app/auto_panel.py`,
`packages/shared/src/graph.schema.ts`.

---

## Сводка реестра

| Статус | Количество |
|---|---|
| Open | 0 |
| In Progress | 0 |
| Fixed | 6 |
| Documented | 0 |
| Deferred | 0 |
| Won't Fix | 0 |
| Resolved | 1 |
| **Всего** | **7** |

> Сводка пересчитана поиском по файлу перед релизом `v0.5.0` (RULES § 3.9):
> 7 заголовков `### KI-` и 7 статусных строк; Open 0, Fixed 6, Resolved 1,
> Deferred 0, всего 7.
