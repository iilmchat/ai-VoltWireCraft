# V091_CI_E_XLSX_IMPLEMENTATION_REPORT — Agent 2

| Параметр | Значение |
|---|---|
| Repository / branch | `iilmchat/ai-VoltWireCraft`, `integration/v091-verification` |
| Обязательный baseline HEAD | `1e59156cbe254a34988c7ae77188ff81bded0243` |
| Проверенный HEAD перед изменениями | `1e59156cbe254a34988c7ae77188ff81bded0243` (совпал) |
| Implementation commit | `67103e89d6d241599d2a8b0bcadfcb81ef22eeb7` |
| Автоматический integration run implementation SHA | https://github.com/iilmchat/ai-VoltWireCraft/actions/runs/45784718687 (`event=push`, `headSha=67103e8…`, `conclusion=success`) |
| Основной CI run implementation SHA (`workflow_dispatch`) | https://github.com/iilmchat/ai-VoltWireCraft/actions/runs/45785012257 (`headSha=67103e8…`) |
| Решение PO | Утверждены официальный SheetJS 0.20.3, vendoring, `file:` dependency, закрепление SHA-256/SHA-512, сохранение `pnpm audit --audit-level=high`. Повторного подтверждения не запрашивалось. |

---

## 1. История коммитов и изменённые файлы

```
1e59156 docs(ci): add LibreDWG smoke remediation report        <- baseline
67103e8 fix(deps): vendor verified SheetJS 0.20.3 and enforce tarball checksum
```

В implementation commit вошли только разрешённые файлы:

| Файл | Изменение |
|---|---|
| `apps/web/package.json` | `"xlsx": "0.18.5"` → `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` |
| `pnpm-lock.yaml` | Регенерирован; ссылка на локальный tarball с SRI `0.20.3`; записи `xlsx@0.18.5` удалены |
| `apps/web/vendor/xlsx-0.20.3.tgz` | Новый вендорированный архив (2 409 319 bytes) |
| `scripts/verify-vendored-xlsx.mjs` | Новый checksum gate (SHA-256 + SHA-512 SRI, без сети) |
| `scripts/verify-vendored-xlsx.test.mjs` | 9 regression-тестов checksum gate |
| `apps/web/src/lib/bomExport.test.ts` | 2 regression-теста реального XLSX export |
| `.github/workflows/ci.yml` | 3 вызова checksum script перед каждым `pnpm install` |
| `.github/workflows/ci-integration.yml` | 1 вызов checksum script перед `pnpm install` |
| `.github/workflows/release-desktop.yml` | 1 вызов checksum script перед `pnpm install` |

Не изменены: `apps/calc-engine/Dockerfile`, `Dockerfile.ci`, `docker-compose.yml`, `docker-compose.ci-smoke.yml`, LibreDWG, JWT/session/RBAC/guards, security/business logic, JUnit gate и его manifest, audit threshold, GitHub Settings/Secrets/Variables/Environments. Отчёты proposal/аудита в коммит не добавлены. Merge, release, tag, deploy не выполнялись.

---

## 2. Прямое получение и проверка официального архива

Источник: **https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz** — архив загружен напрямую с official CDN в временную директорию вне authoritative worktree (`C:\Users\Z1\AppData\Local\Temp\opencode\xlsx-impl\`), после чего скопирован в `apps/web/vendor/`. Хэши вычислены из **свежезагруженных байтов** и повторно из скопированного файла; совпадение подтверждено. Сохранённый ранее temp-архив из proposal не использовался как источник.

| Параметр | Значение |
|---|---|
| Размер | `2409319` bytes (совпал) |
| SHA-256 | `8DC73FC3B00203E72D176E85B50938627C7B086E607C682E8D3C22C02BB99FE8` (совпал) |
| SHA-512 hex | `A0B0EADE3C3B01C2EA2961F60210A9553665F267FA5F661178FF8D7A1D12254CD5FC1759623B61F78B46E6DA22301D4F3EB62DC4E09F6A850292FB6E1FEDC024` |
| SHA-512 SRI | `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==` (совпал) |

Метаданные `package.json` внутри архива:

```json
{
  "name": "xlsx",
  "version": "0.20.3",
  "author": "sheetjs",
  "license": "Apache-2.0",
  "repository": { "type": "git", "url": "https://git.sheetjs.com/SheetJS/sheetjs" },
  "main": "xlsx.js",
  "module": "xlsx.mjs",
  "types": "types/index.d.ts",
  "scripts": { "pretest": "npm run lint", "test": "npm run tests-only", "pretest-only": "git submodule init && git submodule update", "tests-only": "make travis", "build": "make", "lint": "make fullint", "dtslint": "dtslint types" }
}
```

Lifecycle-скриптов `install`/`preinstall`/`postinstall` **нет** — установка не выполняет код поставщика. Архив содержит `xlsx.js`, `xlsx.mjs`, `types/index.d.ts`, `LICENSE`, `CHANGELOG.md`, `bin/xlsx.njs` и dist-файлы; распакованные `node_modules` и дубли архива в Git не попали (`git check-ignore` для архива — нет; `git ls-files` не показывает `node_modules`).

Прямое доказательство исправлений в самом upstream-архиве (`package/CHANGELOG.md`):

- `## v0.19.3`: *Fixed "Prototype Pollution" vulnerability (CVE-2023-30533)*;
- `## v0.20.2`: *Reworked parsing methods to avoid slow regexes (CVE-2024-22363)*;
- `## v0.20.3`: выпуск новее обоих исправлений.

---

## 3. Vendoring и lockfile

- Dependency: `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` (путь относительно `apps/web`, синтаксис pnpm 12.11.2).
- Lockfile importer `apps/web`:
  - `specifier: file:vendor/xlsx-0.20.3.tgz`;
  - `version: file:apps/web/vendor/xlsx-0.20.3.tgz`;
  - snapshot: `resolution: {integrity: sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==, tarball: file:apps/web/vendor/xlsx-0.20.3.tgz}`, `version: 0.20.3`.
- Записанный integrity **полностью совпадает** с SHA-512 SRI официального архива.
- `pnpm install --frozen-lockfile` — PASS (`Lockfile is up to date, resolution step is skipped`). Установка не обращается к CDN.
- Фактически установленный пакет: `apps/web/node_modules/xlsx/package.json` → `xlsx 0.20.3 sheetjs Apache-2.0`; symlink ведёт в `node_modules/.pnpm/xlsx@file+apps+web+vendor+xlsx-0.20.3.tgz/node_modules/xlsx`.
- Imports в приложении не менялись: `apps/web/src/lib/bomExport.ts` по-прежнему использует `await import('xlsx')` и те же `aoa_to_sheet` / `book_new` / `book_append_sheet` / `writeFile`.

---

## 4. Checksum enforcement

`scripts/verify-vendored-xlsx.mjs`:
- находит архив относительно корня repository (`VENDOR_RELATIVE_PATH = apps/web/vendor/xlsx-0.20.3.tgz`);
- проверяет существование и `statSync().isFile()`;
- вычисляет SHA-256 и SHA-512 SRI и сравнивает с полностью закреплёнными константами (включая полный SHA-512 hex);
- exit 1 при отсутствии файла, ошибке чтения, не-файле или несовпадении любого хэша;
- не использует сеть и не выводит содержимое архива.

Локальный запуск: `Vendored XLSX checksum PASSED sha256=8DC73F… sri=sha512-oLDq3j…`, exit 0.

`scripts/verify-vendored-xlsx.test.mjs` — **9/9 passed**: matching констант, корректный архив, копия архива, отсутствующий файл, изменённый архив, произвольный файл по ожидаемому пути, директория вместо файла, ошибка чтения (инъекция бросающего `readFile`), пустой путь.

| Workflow | Строка checksum step | Перед dependency install |
|---|---|---|
| `.github/workflows/ci.yml` (job `node`) | 56 | 60 — `pnpm install --frozen-lockfile` |
| `.github/workflows/ci.yml` (job `security`) | 153 | 157 |
| `.github/workflows/ci.yml` (job `smoke`) | 219 | 223 |
| `.github/workflows/ci-integration.yml` | 74 | 78 |
| `.github/workflows/release-desktop.yml` | 65 | 69 |

Все 5 JS-установок в репозитории покрыты. Job `python` (`ci.yml`) использует только `pip install -r requirements-dev.txt` и не потребляет вендорированный JS-архив — checksum step туда не добавлялся. Triggers, jobs, условия запуска и audit threshold не менялись.

---

## 5. Security audit и disposition advisory

`pnpm audit --json`: exit **1** (из-за отдельного moderate), counts `info=0, low=0, moderate=1, high=0, critical=0`. Единственная запись — `1102341`, `esbuild@0.18.20`, `GHSA-67mh-4wv8-2f99`, moderate, путь `apps__api>drizzle-kit>@esbuild-kit/esm-loader>@esbuild-kit/core-utils>esbuild`, `dev=true`. Это **не XLSX finding** и не было скрыто.

| Advisory | Disposition |
|---|---|
| `1108110` / `GHSA-4r6h-8v6p-xvw6` / `CVE-2023-30533` (Prototype Pollution, `<0.19.3`) | Устранён: установлен `0.20.3`; upstream changelog фиксирует исправление в `0.19.3` |
| `1108111` / `GHSA-5pgg-2g8v-p4x9` / `CVE-2024-22363` (ReDoS, `<0.20.2`) | Устранён: установлен `0.20.3`; upstream changelog фиксирует исправление в `0.20.2` |
| `1102341` / `GHSA-67mh-4wv8-2f99` (esbuild, dev-only) | Не XLSX; остаётся открытым, требуется отдельное решение PO |

`pnpm audit --audit-level=high` — exit **0** (`1 vulnerabilities found / Severity: 1 moderate`). `pnpm why xlsx` → `xlsx@0.20.3 └── web@0.9.0 (dependencies)`, `Found 1 version of xlsx`. В lockfile отсутствуют `xlsx@0.18.5` и `specifier: 0.18.5`. Ignore/allowlist, `continue-on-error`, `--force` и снижение порогов не использовались.

Поскольку локальная `file:` dependency может не сканироваться аудитором, исправление доказано дополнительно: (1) фактическая версия установленного пакета `0.20.3`; (2) затронутые диапазоны `<0.19.3` и `<0.20.2` из исходного audit JSON; (3) прямое upstream-evidence из `CHANGELOG.md` в самом загруженном архиве; (4) содержимое архива сверено по SHA-256/SHA-512. Не объявляется «исправлено» только на основании того, что scanner перестал видеть пакет.

---

## 6. Функциональность XLSX и regression

Новый `apps/web/src/lib/bomExport.test.ts` (2/2 passed) проверяет реальный публичный путь `exportBomXlsxAsync()`:
- создаётся настоящий `.xlsx` с magic bytes `PK` и размером > 100 bytes;
- лист назван `Спецификация`;
- заголовки и значения (строки, целые, дробь `12.5`, пустая ячейка при `lengthM: null`) сохранены;
- расширение не дублируется, если передано `already.xlsx`.

В тесте используется инъекция Node `fs` через `XLSX.set_fs(nodeFs)` — это документированное ограничение ESM-сборки SheetJS при записи в файл из Node; браузерный путь приложения (DOM download) не менялся.

Полный набор Web-проверок (после `pnpm --filter @voltwirecraft/shared build`):

| Проверка | Результат |
|---|---|
| `pnpm --filter web test` | **17 файлов / 99 тестов passed** (было 16 / 97, добавлено 2) |
| `pnpm --filter web typecheck` | PASS |
| `pnpm --filter web lint` | PASS |
| `pnpm --filter web build` | PASS; чанк `xlsx-DR4W_luh.js` 492.02 kB (gzip 160.36 kB) |
| `pnpm lint`, `pnpm typecheck:scripts` | PASS |
| YAML-валидация всех workflows | PASS |

---

## 7. CI-прогоны на implementation SHA

### Автоматический integration workflow
`https://github.com/iilmchat/ai-VoltWireCraft/actions/runs/45784718687` — `event=push`, `headSha=67103e89d6d241599d2a8b0bcadfcb81ef22eeb7`, `conclusion=success`.
- Step `Verify vendored SheetJS tarball checksum` в логе: `Vendored XLSX checksum PASSED sha256=8DC73F… sri=sha512-oLDq3j…`.
- Artifact `integration-reports/junit-integration.xml`: `tests=215 failures=0 errors=0`, 25 suite; `node scripts/assert-ci-junit.mjs` → `CI JUnit gate PASSED` (0 failures/errors/skipped).

### Основной `ci.yml` (`workflow_dispatch`)
`https://github.com/iilmchat/ai-VoltWireCraft/actions/runs/45785012257` — `headSha=67103e8…`.

| Job | Результат |
|---|---|
| Node (typecheck/lint/test/migrations/build) | success |
| Python (pytest) | success |
| Docker Compose config | success |
| E2E smoke (Bearer) | success (с прежним LibreDWG CI-only Dockerfile) |
| Integration (вызов `ci-integration.yml`) | success |
| **Security (SEC-01/SEC-02 QA gates)** | **failure, step 12 `AppModule bootstrap gate`** |

Что **реально выполнилось** в Security job до падения: checksum step (PASS), `pnpm install --frozen-lockfile` (PASS), Build shared contracts, Secret scanning, **Dependency audit (CI gate)** — PASS (`1 vulnerabilities found / Severity: 1 moderate`, exit 0 для `--audit-level=high`), **PostgreSQL migrations** — PASS. Затем step 12 завершился exit 1; JUnit `junit-bootstrap.xml` содержит `tests=0`.

### Точные причины оставшегося failure (не вызваны XLSX-изменениями)

1. **Устаревший путь в `ci.yml`:** step 12 выполняет `vitest run test/security/s2-bootstrap.test.ts`, но этого файла в baseline нет (`Test-Path → false`). Файл существовал в коммите `e26af40` и позже был удалён; текущий bootstrap-тест — `apps/api/test/app.bootstrap.test.ts`. Vitest завершается с «no test files found» → exit 1, JUnit `tests=0`.
2. **Отсутствующий coverage provider:** step 13 (`Security test suite`) использует `--coverage.enabled`, но `@vitest/coverage-v8` присутствует в lockfile только как **optional peer** vitest и не установлен. Локальный запуск даёт `MISSING DEPENDENCY Cannot find dependency '@vitest/coverage-v8'` → exit 1.

При этом сами тесты исправны: с реальными PostgreSQL 17 + Redis локально `test/app.bootstrap.test.ts` — **3/3 passed** (`junit-bootstrap-local.xml`), а `vitest run test/security` без coverage — **23/23 passed, 0 failures/errors** (`junit-security-local.xml`). Таким образом, падение CI вызвано дефектами тестового harness в `ci.yml`, а не кодом приложения и не XLSX-remediation. Оба дефекта existed до implementation commit: в предыдущем run `45641890549` Security job падал раньше — на step `Dependency audit` из-за `xlsx@0.18.5`, поэтому эти более поздние шаги никогда не выполнялись и не были обнаружены.

Эти дефекты **не исправлены**: исправление пути и добавление devDependency `@vitest/coverage-v8` выходят за разрешённый scope XLSX-remediation. Gates не ослаблены, `--coverage.enabled` не удалён, `continue-on-error` не добавлен. Требуется отдельное решение PO.

---

## 8. Остаточные риски

- npm registry по-прежнему застрял на `xlsx@0.18.5`; advisory БД продолжают указывать `patched_versions: null`. Доказательство исправления опирается на официальный CDN, закреплённые хэши и changelog внутри архива.
- Snyk может ложно сообщать о prototype pollution для исправленных версий SheetJS (по данным vendor) — в рамках этого аудита не проверялось.
- Вендорированный tarball добавляет ~2.4 MB в Git; при обновлении SheetJS нужно вручную перепроверить хэши и обновить константы checksum script + lockfile.
- Чанк XLSX остаётся ~492 kB (gzip ~160 kB).
- ESM-поведение Node (`XLSX.set_fs`) отличается от браузерного пути; тесты компенсируют инъекцией `fs`.
- Отдельный dev-only moderate `esbuild` остаётся открытым и не является XLSX-advisory.
- Security job в `ci.yml` остаётся красным по двум описанным выше причинам, не связанным с XLSX; до решения PO статус основного CI — failure при успешном Security Dependency audit.

---

## 9. Завершение

Implementation commit `67103e89d6d241599d2a8b0bcadfcb81ef22eeb7` передан на проверку. Финальные прогоны на SHA отчёта запускаются после его коммита; их точные URL и результат сообщаются в финальной передаче PO. Merge в main, PR merge, release, tag и production deploy не выполнялись.
