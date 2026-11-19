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
