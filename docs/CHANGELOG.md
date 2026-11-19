# Changelog

Все значимые изменения проекта **VoltWireCraft** документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).
Проект придерживается [Semantic Versioning](https://semver.org/lang/ru/).

Типы изменений:
- **Added** — новая функциональность
- **Changed** — изменения в существующей функциональности
- **Deprecated** — функции, помеченные как устаревшие
- **Removed** — удалённая функциональность
- **Fixed** — исправления
- **Security** — исправления уязвимостей
- **Documented** — задокументированные ограничения и особенности

---

## [Unreleased]

### Added

- Инициализация репозитория `ai-VoltWireCraft`: стартовый пакет документации.
- `README.md` — описание полного цикла проектирования, архитектурная схема
  (веб-клиент, настольное приложение Tauri, NestJS API, расчётное ядро на
  Python/FastAPI, PostgreSQL 17 + pgvector), стек, быстрый старт через Docker
  Compose и навигация по `docs/`.
- `docs/development/RULES.md` — свод правил версии 1.0.0 с доменными правилами:
  разделение ИИ и математики, Graph-First, единицы СИ, офлайн-режим Desktop,
  сандбоксинг CAD-файлов, электротехническая терминология.
- `docs/KNOWN_ISSUES.md` — пустой реестр проблем с легендой статусов и резервом
  под `KI-001`.
- `docs/development/v0.1/DESIGN_V010_CORE_AND_PLANNER.md` — заготовка
  дизайн-документа релиза 0.1 по структуре из 8 обязательных секций.
- Инфраструктура монорепозитория: `pnpm` workspaces + Turborepo, корневой
  `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` (TypeScript 6,
  `strict: true`, ESM), `turbo.json`, единый flat-конфиг ESLint с запретом `any`.
- Каркасы приложений: `packages/shared` (`@voltwirecraft/shared` с Zod-контрактами),
  `apps/api` (NestJS 12, Zod-валидация env, `GET /health` с проверками PostgreSQL,
  Redis и calc-engine), `apps/calc-engine` (FastAPI, `GET /health`,
  `POST /calculate/cable-length`), `apps/web` (React 19 + Vite 8 + Tailwind CSS 4
  + Zustand 5 + Konva.js, конфигурация Tauri 2).
- `docker-compose.yml` и `.env.example`: PostgreSQL 17 + pgvector (5436),
  Redis 7 (6381), MinIO (9000/9001), calc-engine (8000) с healthcheck.
- `.gitignore`, `.gitattributes` (`eol=lf`), Husky + lint-staged со скриптом
  проверки на утечку секретов `scripts/check-secrets.mjs`.
- `.github/workflows/ci.yml`: typecheck, lint, test и сборка для `shared`, `api`,
  `web`; `pytest` для `calc-engine`; валидация `docker compose config`.
- UI редактора плана в `apps/web`: `FloorPlanEditor` на `react-konva` с зумом
  колесиком относительно курсора и панорамированием средней кнопкой / `Space`+drag;
  слои подложки, помещений, ЭУИ и инструментов.
- Загрузка подложки PNG/JPG и рендер выбранной страницы PDF через `pdfjs-dist`
  в высоком разрешении (масштаб растеризации 2) с сохранением data URL в графе.
- Инструмент `ScaleCalibratorTool`: рисуемый отрезок, ввод реальной длины в мм,
  расчёт и запись `scaleMetersPerPx` в `FloorPlanSchema`.
- Инструмент `RoomZoneTool`: замкнутый полигон с типами `living`, `wet`,
  `kitchen`, `outdoor`, `utility` и полупрозрачной заливкой.
- Инструмент `DevicePlacementTool` и `InspectorPanel`: drag-and-drop и установка
  кликом ЭУИ (`panel`, `socket`, `switch`, `light_fixture`, `appliance`),
  редактирование УГО, мощности, высоты установки и привязки к помещению.
- Локальный экспорт/импорт `.vwc`: `ProjectGraphSchema`/`VwcFileSchema`,
  диагностика несовместимости версий и офлайн-работа без API.
- i18n RU/EN: все строки интерфейса вынесены в `ru.json` / `en.json` с проверкой
  полноты ключей на этапе компиляции.
- `docs/development/v0.1/UI_EDITOR.md` — описание интерфейса, инструментов,
  горячих клавиш и формата `.vwc`.
- Тесты UI: геометрия и зум, калибровка, зонирование, расстановка ЭУИ,
  строгая валидация экспорта/импорта (22 теста в `apps/web`).

### Changed

- Зафиксирована каноническая `ProjectGraphSchema` в `packages/shared`:
  `FloorPlanSchema` с `scaleMetersPerPx` и `ceilingHeightM`, `RoomZoneSchema`
  с типами зон `living | wet | kitchen | outdoor | utility`, `GraphNodeSchema`
  с 11 типами УГО и секциями `planPosition`, `panelSlot`, `specs`,
  `GraphEdgeSchema` с `cableSpecs`; все физические величины — в единицах СИ.
- `DESIGN_V010` § 8 заполнен утверждёнными решениями: GitHub
  `iilmchat/ai-VoltWireCraft`, Drizzle ORM, формат `.vwc` (`VwcFileSchema`),
  лимит подложки 25 МБ и таймаут 30 с, базовый набор из 11 типов УГО.
- `DESIGN_V010` §§ 2.3, 3.2, 6: в `v0.1.0` подложки PDF, PNG и JPG
  обрабатываются на клиенте (`pdfjs-dist` + Konva.js) с ручной калибровкой
  масштаба; разбор DXF/DWG перенесён в `v0.2.0`.
- `README.md`: обновлён URL репозитория на
  `https://github.com/iilmchat/ai-VoltWireCraft.git`, уточнены поддерживаемые
  форматы подложек и стек (Drizzle ORM, `pdfjs-dist`).

### Added (бэкенд-хранилище и расчёты)

- `packages/shared/src/graph.schema.ts` — единственная каноническая модель
  проекта по DESIGN_V010 § 3.1: `floorPlan`, `rooms`, `walls`, `nodes`
  (11 типов УГО, `planPosition`, `panelSlot`, `specs`), `edges` с `cableSpecs`,
  `ProjectGraphSchema` с проверкой уникальности ID и ссылочной целостности,
  `VwcFileSchema`, DTO проектов и контракты расчёта длины кабеля.
  Экспорт через основной API и подпуть `@voltwirecraft/shared/graph.schema`.
- Таблицы `projects` (`graph_json` JSONB) и `floor_plans` (FK + CASCADE) в
  `apps/api/src/database/schema.ts`; сгенерированная миграция
  `0000_common_clea.sql`, команды `db:generate` / `db:migrate`.
- `ProjectsService` и `ProjectsController`: `POST /projects`, `GET /projects/:id`,
  `PUT /projects/:id/graph`, `POST /projects/:id/floor-plans`. Все ответы — в
  единой обёртке `ApiResponse`; вход и выход валидируются Zod.
- Загрузка подложек PDF/PNG/JPG до 25 МБ с определением формата по magic bytes
  и адаптерами `LocalFloorPlanStorage` / `S3FloorPlanStorage`.
- `apps/calc-engine`: детерминированный `app/calculator.py` (расчёт в `Decimal`,
  округление до 1 мкм), Pydantic-контракты `app/schemas.py`, FastAPI-эндпоинт
  `POST /v1/calc/cable-length` и обратно совместимый `POST /calculate/cable-length`.
- Юнит-тесты расчётного ядра (25 тестов) и интеграционные тесты `ProjectsService`
  на PGlite с применением реальной сгенерированной миграции (15 тестов).

### Added (завершение UI v0.1)

- Фронтенд переведён на каноническую `ProjectGraphSchema` из
  `@voltwirecraft/shared/graph.schema`: `apps/web` использует единые типы
  `ProjectGraph`, `FloorPlan`, `RoomZone`, `GraphNode`, `GraphEdge`,
  `VwcFileSchema`; дублирующая схема из `index.ts` удалена (KI-001).
- `CableRouteTool`: трассировка кабеля от щита/ВРУ/УЗО к потребителю через
  поворотные точки `waypointsPx`; создаётся `GraphEdge` с `edgeType:
  'cable_line'`, маркой `ВВГнг(А)-LS`, числом жил и сечением в мм².
- `apps/web/src/lib/apiClient.ts` — типизированный клиент с Zod-валидацией
  ответов для `POST /projects`, `GET /projects/:id`, `PUT /projects/:id/graph`,
  `POST /projects/:id/floor-plans`; ошибки превращаются в `ApiClientError`.
- Кнопки «Сохранить на сервер» и «Загрузить с сервера» в `Header` при сохранении
  офлайн-кнопок экспорта/импорта `.vwc` (RULES § 5.4).
- Тесты UI обновлены под канонический граф: калибровка, зонирование,
  расстановка ЭУИ, кабельные трассы, Zod-валидация API-ответов (28 тестов).

### Changed

- Граф унифицирован: удалены дублирующие `packages/shared/src/graph.ts` и
  `cable.ts` вместе с `BackendProjectGraphSchema`. `index.ts` стал чистым
  реэкспортом канонической схемы; API, клиент, Drizzle-колонка `graph_json`
  и файл `.vwc` используют один и тот же `ProjectGraph` (RULES § 5.2).

### Fixed

- KI-001 закрыт: две конкурирующие модели графа в `shared` устранены.
- Расчёт длины кабеля приведён к контракту задания: `waypointsPx`,
  `scaleMetersPerPx`, высоты потолка/установки и коэффициент запаса 1.15.
  Ранее каркас использовал несовместимый контракт `points`/`slack`.
- Конфигурация `turbo.json`: для `test` больше не запрашиваются несуществующие
  файлы `coverage/**`, что убирало предупреждения Turborepo.

### Documented

- `apps/calc-engine/README.md` — формула расчёта, формат контракта и запуск.
- `docs/KNOWN_ISSUES.md` — `KI-001` закрыт после унификации графа;
  `KI-002` (проверка миграций на PGlite вместо реального PostgreSQL) и
  `KI-003` (координаты трассы в пикселях при СИ-величинах) остаются
  задокументированными ограничениями.
