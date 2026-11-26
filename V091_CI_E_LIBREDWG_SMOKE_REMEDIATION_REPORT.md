# V091_CI_E_LIBREDWG_SMOKE_REMEDIATION_REPORT — Agent 2

**Дата:** 2026-11-25
**Режим:** CI-only изменение. Production Dockerfile, default `docker-compose.yml`, код приложения, JUnit gate, integration workflow, security/session/RBAC-логика не изменялись.

---

## 1. Baseline и final SHA

| Что | SHA |
|---|---|
| Baseline | `5f2bf3ce4a8b1514d4a03f3fd3c4ba24ca96d3be` |
| Code commit | `872f21f9ba4895f36ccde0e23a9d777e43afa46c` — `ci(smoke): build LibreDWG with GNU plotutils in CI-only image` |
| CI run (code commit) | **45639812521** — https://github.com/iilmchat/ai-VoltWireCraft/actions/runs/45639812521 |
| Final SHA | report-only коммит поверх `872f21f`; рабочий код и workflow идентичны `872f21f` |

CI run event: `workflow_dispatch`, branch `integration/v091-verification`, headSha `872f21f9…`.

---

## 2. Root cause (подтверждено)

В исходном smoke job выполнялся `docker compose up -d --build`, который собирал `calc-engine` по production `apps/calc-engine/Dockerfile`. В build-стадии `cad-tools` выполняется:

```
./configure --disable-bindings --disable-docs --enable-release
```

На Debian trixie в этом контейнере отсутствовали `plot.h` и libplot-разработка. Лог прежнего прогона:

```
configure: error: --enable-release needs libplot and plot.h of GNU plotutils for dwgplot.
ERROR: process "/bin/sh -c git clone ... ./configure --enable-release ..." did not complete successfully: exit code: 1
```

Отказ происходил **в build stage**, не в runtime. Попытка поставить пакеты на хост GitHub runner не помогла бы — пакеты нужны внутри Docker build container.

---

## 3. Изменённые файлы

| Файл | Изменение |
|---|---|
| `apps/calc-engine/Dockerfile.ci` | **новый** CI-only multi-stage Dockerfile: те же исходники иconfigure-опции, добавлены `plotutils libplot-dev`; apt-источники переведены на HTTPS (в локальной среде HTTP-зеркало недоступно) |
| `docker-compose.ci-smoke.yml` | **новый** CI-only override: у `calc-engine` только `build.dockerfile: Dockerfile.ci`; context и imagename остаются прежними |
| `.github/workflows/ci.yml` | только smoke job: `docker compose -f docker-compose.yml -f docker-compose.ci-smoke.yml up -d --build` |

Production `apps/calc-engine/Dockerfile` и default `docker-compose.yml` — **без изменений** (проверено `git diff`). Список сервисов в compose и compose+override одинаков: `postgres`, `redis`, `calc-engine`, `api`, `web`.

---

## 4. CI-only build architecture

- Сборка идёт из того же context `./apps/calc-engine`, тех же `requirements.txt`, `app/`, того же git-источника LibreDWG (`--depth 1 https://github.com/LibreDWG/libredwg.git`) и с теми же configure-опциями (`--disable-bindings --disable-docs --enable-release`).
- В CI build stage установлены:
  - существующие build-зависимости: `build-essential`, `autoconf`, `automake`, `libtool`, `texinfo`, `perl`, `git`, `ca-certificates`;
  - добавлены: `plotutils`, `libplot-dev` версии **2.6-14+b3** (Debian trixie; транзитивно `libplot2c2` той же версии).
- Никакие опции не отключены; `dwgplot` собирается и устанавливается в build stage (в логе: `CC dwgplot.o`, `CCLD dwgplot`, `install -c .libs/dwgplot /usr/local/bin/dwgplot`).
- В runtime-образ переносятся только те же артефакты, что и в production: `dwg2dxf`, `dxf2dwg`, `libredwg.so*`. `dwgplot` **не** копируется.

### Build-stage vs runtime dependency analysis

- Build stage: `/usr/include/plot.h` присутствует; configure → `checking for plot.h... yes`; сборка LibreDWG и `make install` завершились (`DONE`, image `voltwirecraft/calc-engine:0.1.0`).
- Runtime stage: `ldd /usr/local/bin/dwg2dxf`, `ldd /usr/local/bin/dxf2dwg` и `ldd /usr/local/lib/libredwg.so.0` показывают только `libredwg.so.0`, `libm`, `libc`, `ld-linux`; **libplot в runtime не требуется**. `dwgplot` в runtime-образе отсутствует. Дополнительный runtime-пакет не добавлен.

---

## 5. Доказательства успеха

### Локально (изолированный стек `vwc-ci-smoke`)
- `docker compose -f docker-compose.yml -f docker-compose.ci-smoke.yml build calc-engine` → `Image voltwirecraft/calc-engine:0.1.0 Built`.
- Configure в логе: `checking for plot.h... yes`; `dwgplot` собран и установлен в build stage.
- Все сервисы подняты; `POST /auth/register` → **201**.
- `pnpm smoke:e2e` → **`SMOKE OK: 437 проверок пройдено по 7 кейсам`**, exit 0.
- Cleanup: контейнеры, volume'ы и network удалены, `CLEANUP_EXIT=0`.

### GitHub Actions run 45639812521
| Job | Результат |
|---|---|
| Node (typecheck / lint / test / migrations / build) | success |
| Python (pytest) | success |
| Docker Compose config | success |
| Integration (PostgreSQL 17 + Redis, no skips) | success |
| **E2E smoke (Bearer)** | **success** |
| Security (SEC-01/SEC-02 QA gates) | failure (xlsx high, намеренно вне scope) |

Лог smoke job:
- `Setting up libplot2c2`, `libplot-dev`, `plotutils` версии `2.6-14+b3`;
- `checking for plot.h... yes`;
- `CCLD dwgplot`, `install ... dwgplot`;
- `Register smoke test account` — без `register failed`;
- `Run smoke with Bearer` → `SMOKE OK: 437 проверок пройдено по 7 кейсам`.

### Integration-набор
Локально с `VWC_PG17_URL` и `VWC_REDIS_URL`: `215 passed / 0 failed / 0 skipped`, `CI JUnit gate PASSED`. В CI run 45639812521 integration job — success.Ни JUnit gate, ни его manifest, ни регрессионные тесты не изменялись.

---

## 6. Ограничения

- Общий workflow run имеет conclusion `failure` из-за Security job (`pnpm audit --audit-level=high`: xlsx <0.19.3, high, Prototype Pollution). По заданию XLSX-исправление исключено и не подавлено.
- Автоматический запуск CI по push только в ветку `integration/v091-verification` в workflow не настроен (триггеры: `workflow_dispatch`, push/PR в `main`); для проверки использован `workflow_dispatch`.
- Локальная сборка потребовала HTTPS-источников apt из-за недоступности HTTP-зеркала в среде агента; в CI HTTPS тоже работает (подтверждено логом).
- LibreDWG собирается с `--depth 1` из ветки по умолчанию — источник/версия не закреплены коммитом; это унаследованное от production Dockerfile свойство, не изменявшееся в этом задании.
- Полный формальный release gate (merge в main, tag v0.9.1, deploy) не выполнялся и не авторизован.

---

## 7. Итог

CI-only remediation завершена: smoke job собирает `calc-engine` с libplot из исходников и проходит полный существующий сценарий **437 проверок / 7 кейсов** без ослабления assert'ов. Production Dockerfile и default compose неизменны; integration job остаётся PASS. Report-only финальный коммит не влияет на рабочий код и workflow.
