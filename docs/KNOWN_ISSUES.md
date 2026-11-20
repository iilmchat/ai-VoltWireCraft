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

### KI-005 — DWG требует внешний ODA-конвертер 🟡 Medium · Deferred (v0.4.0)

**Проблема.** Нативный парсер `ezdxf` читает только DXF. Файлы DWG принимаются
эндпоинтом `POST /projects/:id/import-cad`, но отклоняются с явным сообщением
до тех пор, пока не настроен конвертер `ODA_CONVERTER_PATH`.

**Митигация.** Пользователь получает понятную причину и предложение
экспортировать чертёж в DXF; контракт и лимиты уже готовы (RULES § 5.5).

**Файлы.** `apps/api/src/projects/projects.service.ts`, `apps/calc-engine/app/cad_parser.py`.

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

### KI-006 — Образ `minio/minio:latest` недоступен в части registry 🟡 Medium · Documented (2026-11-20)

**Проблема.** При запуске полного стека в Docker часть registry возвращает ошибку
получения образа `minio/minio:latest`, из-за чего контейнер объектного
хранилища не стартует и блокирует подъём зависимых сервисов.

**Митигация.** По умолчанию используется `STORAGE_DRIVER=local`: подложки
сохраняются на локальном диске, сервис MinIO не является обязательным.
Для работы с S3 нужно явно указать доступный образ или частный registry
и переключить `STORAGE_DRIVER=s3`.

**Файлы.** `docker-compose.yml`, `.env.example`,
`apps/api/src/projects/storage/floor-plan-storage.ts`.

---

### KI-007 — Трёхфазный режим ввода из `meta` не передаётся в `PanelArchitectAgent` 🟡 Medium · Deferred (v0.5.0)

**Проблема.** Агент сборки щита использует значение по умолчанию для числа
фаз; признак трёхфазного ввода, хранящийся в `meta` проекта, не читается.
Из‑за этого для объектов 400 В компоновка может отличаться от ожидаемой.

**Планируемое решение.** Передавать `meta.phases` в запрос автосборки и
учитывать его при расстановке вводных аппаратов и балансировке L1/L2/L3
в `v0.5.0`. Текущие расчёты линий трёхфазный режим поддерживают.

**Файлы.** `apps/api/src/agents/`, `apps/calc-engine/app/auto_panel.py`.

---

## Сводка реестра

| Статус | Количество |
|---|---|
| Open | 0 |
| In Progress | 0 |
| Fixed | 3 |
| Documented | 1 |
| Deferred | 2 |
| Won't Fix | 0 |
| Resolved | 1 |
| **Всего** | **7** |

> Сводка пересчитана поиском по файлу перед релизом `v0.4.0` (RULES § 3.9):
> 7 заголовков `### KI-` и 7 статусных строк; Fixed 3 + Documented 1 + Deferred 2 + Resolved 1 = 7.
