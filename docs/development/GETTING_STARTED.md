# Быстрый старт VoltWireCraft (Docker)

**Версия:** 0.1 · **Дата:** 2026-11-20

Инструкция описывает локальный запуск **всей системы** одной командой и
сквозной прогон «Золотого датасета» через живой API.

---

## 1. Требования

- Docker Desktop (движок запущен) с Compose v2;
- Node.js 22+ и pnpm 12+ — только для запуска smoke-скрипта;
- свободные порты: `5436`, `6381`, `8000`, `3000`, `5173` (обязательные сервисы);
  `9000`/`9001` нужны только при включённом профиле `s3` (MinIO).
  Порты можно изменить в `.env`.

---

## 2. Подготовка окружения

```bash
cp .env.example .env
docker compose config --quiet
```

`docker compose config` проверяет итоговую конфигурацию. По умолчанию активны
пять обязательных сервисов (`docker compose config --services`); MinIO вынесен
в профиль `s3` и поднимается только командой `docker compose --profile s3 up -d`.
Секреты в `.env.example` — **заглушки**; реальные значения хранятся только в
`.env` (RULES § 6.2).

---

## 3. Запуск

```bash
docker compose up -d --build
```

Состав (порты по умолчанию):

| Сервис | Образ / сборка | Порт | Назначение |
|---|---|---|---|
| `postgres` | `pgvector/pgvector:pg17` | 5436 | PostgreSQL 17 + pgvector, граф и RAG |
| `redis` | `redis:7-alpine` | 6381 | очереди и кэш |
| `minio` (profile `s3`) | `minio/minio` | 9000 / 9001 | опциональное S3-хранилище |
| `calc-engine` | `apps/calc-engine/Dockerfile` | 8000 | расчёты, разбор DXF и конвертация DWG (`dwg2dxf`) |
| `api` | `apps/api/Dockerfile` | 3000 | NestJS API, миграции и сиды при старте |
| `web` | `apps/web/Dockerfile` | 5173 → 80 | статика React, раздаётся nginx |

API стартует только после `service_healthy` у PostgreSQL, Redis и calc-engine.
Перед подъёмом HTTP-сервера контейнер **сам** выполняет:

1. `node dist/database/migrate.js` — все Drizzle-миграции (включая
   `CREATE EXTENSION vector` и HNSW-индекс);
2. `node dist/database/seed-catalog.js` — 40 позиций каталога;
3. `node dist/database/seed-normatives.js` — фрагменты ПУЭ-7 для RAG.

Все шаги идемпотентны, поэтому `docker compose restart api` безопасен.

Конвертация DWG выполняется в `calc-engine` в изолированном процессе с таймаутом
из `CAD_PARSE_TIMEOUT_SEC` (RULES § 5.5). Переменные `DWG_CONVERTER_TYPE`
(`auto | oda | libredwg | none`, по умолчанию `auto`) и `ODA_CONVERTER_PATH`
задаются в `.env`; образ содержит собранный `dwg2dxf`, поэтому ODA не нужен.
Режим `none` полностью отключает приём DWG.

---

## 4. Проверка готовности

```bash
docker compose ps
curl http://localhost:3000/health
curl http://localhost:8000/health
```

`GET /health` API возвращает статусы PostgreSQL, Redis и calc-engine.
Веб-клиент доступен по адресу `http://localhost:5173`, API — `http://localhost:3000`.

Если LLM-ключ не задан, агенты используют детерминированный fallback:
математика всё равно выполняется только в `calc-engine` (RULES § 5.1).

---

## 5. Сквозной прогон (`pnpm smoke:e2e`)

Скрипт `scripts/e2e-smoke.mjs` работает с уже поднятыми контейнерами:

```bash
pnpm install --frozen-lockfile
pnpm smoke:e2e
```

Что делает скрипт:

1. проверяет `GET /health` у `api` и `calc-engine`;
2. автоматически находит **все полные кейсы** в `fixtures/golden-dataset/`
   (`project.vwc`, `plan.dxf`, `expected_calc.json`) и для каждого загружает
   граф через `POST /projects` + `PUT /projects/:id/graph`;
3. импортирует `plan.dxf` через `POST /projects/:id/import-cad`;
4. выполняет `POST /projects/:id/calculate`,
   `POST /projects/:id/ai/assemble-panel`,
   `POST /projects/:id/short-circuit` и
   `POST /projects/:id/ai/audit-pue`;
5. сравнивает результаты с `expected_calc.json`: стены DXF, длины линий,
   модули щита, ток КЗ (±50 % от эталонных значений), обязательные пункты ПУЭ,
   а для трёхфазных кейсов (`02_apartment_3room_400v`,
   `05_cottages_3phase_15kw`) — перекос фаз ≤ 15 % по данным эталона и по
   ответу `assemble-panel`;
6. отдельно проверяет конвертацию `fixtures/golden-dataset/dwg/plan.dwg` через
   `POST /v1/cad/parse-dxf` расчётного ядра.

Успешный вывод заканчивается строкой `SMOKE OK: N проверок пройдено по M кейсам`.
При расхождении скрипт печатает `SMOKE FAILED: ...` и завершается с кодом 1.

Переопределение адресов, каталога датасета и отдельного кейса:

```bash
API_URL=http://localhost:3000 CALC_URL=http://localhost:8000 \
SMOKE_FIXTURES_DIR=fixtures/golden-dataset \
SMOKE_CASE=02_apartment_3room_400v \
pnpm smoke:e2e
```

Проверка типов и линтера скрипта:

```bash
pnpm typecheck:scripts
pnpm run lint
```

---

## 6. Остановка и сброс

```bash
docker compose down          # остановить, данные сохранить
docker compose down -v       # остановить и удалить тома (чистый старт)
```

---

## 7. Устранение неисправностей

| Симптом | Действие |
|---|---|
| `api` не стартует | `docker compose logs -f api` — проверьте миграции и `DATABASE_URL` |
| `web` отдаёт 502 | дождитесь `service_healthy` у `api`, затем `docker compose restart web` |
| `SMOKE FAILED: ... GET /health` | проверьте `docker compose ps` и порты в `.env` |
| `import-cad` вернул ошибку | убедитесь, что `calc-engine` здоров и `plan.dxf` не повреждён |
| тесты нумеруются по-другому | точные значения фиксируются первым успешным прогоном; обновите `expected_calc.json` |

Подробности по эталонным объектам — `fixtures/golden-dataset/README.md`.
Правила разработки — [RULES.md](RULES.md).
