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

- Автообновление Tauri: `tauri-plugin-updater` (Rust + `@tauri-apps/plugin-updater`),
  разрешение `updater:default`, `createUpdaterArtifacts` и секция
  `plugins.updater` с endpoint GitHub Releases и публичным ключом-заглушкой.
  Приватный ключ в репозиторий не попадает (RULES § 6.2).
- `.github/workflows/release-desktop.yml`: секреты `TAURI_SIGNING_PRIVATE_KEY`
  и `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` передаются в шаг сборки; по тегу `v*`
  подписанные артефакты и `latest.json` прикрепляются к GitHub Release, при
  отсутствии секретов сборка остаётся доступной как workflow-артефакт.
- `GETTING_STARTED.md` § 8 — инструкция Владельца продукта по генерации пары
  ключей `pnpm --filter web tauri signer generate -w ~/.tauri/voltwirecraft.key`
  и добавлению приватного ключа в GitHub Repository Secrets.
- `docs/development/v0.7/DESIGN_V070_UPDATER_AND_BRAND_THEMING.md` — дизайн
  релиза v0.7.0 по 8 обязательным секциям RULES § 2.14: подписанное
  автообновление Tauri, системы тем Light/Dark/System на токенах Material 3
  из брендбука `ai-brand` v1.1, локальные шрифты и логотипы, адаптация
  холстов Konva.js/Three.js и графика ВТХ, план на 7–8 дней.
- Клиентский сервис обновлений `lib/updater.ts`: динамический импорт
  `@tauri-apps/plugin-updater` / `@tauri-apps/plugin-process` только в Tauri,
  тихая фоновая проверка через 3 с, ручная кнопка в шапке, прогресс скачивания
  0…100 % и перезапуск после установки. В браузере сервис не делает запросов;
  сетевые ошибки фоновой проверки подавляются (RULES § 5.4).
- Модальное окно `UpdateBanner.tsx` с версией, заметками релиза, прогресс-баром
  и кнопками «Обновить и перезапустить» / «Позже».
- Локальные ассеты `ai-brand` в `apps/web/public/brand/` (логотипы, фавиконы,
  PWA-манифест) и 49 ролей Material 3 в `src/styles/theme-m3.css` без внешних
  CDN-шрифтов. Шапка отображает фирменный логотип через `currentColor`,
  `index.html` подключает локальные фавиконы и манифест.
- Переключатель темы `Light / Dark / System` в `uiStore` (`themeMode`) с
  сохранением в `localStorage` и атрибутом `data-theme` на `<html>`; кнопка
  в шапке. Холст плана, компоновка щита и график ВТХ адаптированы к теме
  через CSS-токены ролей Material 3.

### Changed

- Юнит-тесты `updater.test.ts` (веб-режим, доступное обновление, прогресс,
  тихое подавление сетевой ошибки) и `uiStore.theme.test.ts` (переключение
  темы, localStorage, `data-theme`, системный режим).

## [0.6.0] — 2026-11-20

### Added

- `docs/development/v0.6/DESIGN_V060_MULTIPANEL_AND_TCC.md` — дизайн релиза
  v0.6.0 по 8 обязательным секциям RULES § 2.14: иерархия щитов `ВРУ → ЩР`,
  каскадная проверка $\Delta U \le 5\%$, детерминированный движок ВТХ,
  проверка $I_{cn} \ge I_{кз}$, селектор активного щита, кейс 07 и план работ.
- `docs/domain/TCC_SELECTIVITY_V06.md` — граничные точки ВТХ по ГОСТ Р 50345
  (IEC 60898-1) для кривых B/C/D, кусочно-аналитическая модель и алгоритм
  расчёта предела селективности $I_s$ с выдержкой $\Delta t = 0{,}1$ с.
- Селектор активного щита в `uiStore` (`activePanelId`) и панель управления
  иерархией: переключение ВРУ/ЩР, кнопка «Добавить распределительный щит» с
  привязкой `parentPanelId` и созданием фидера `feeder_line`. Все три проекции
  (2D-компоновка, lazy-3D-щит, однолинейная схема) фильтруют один и тот же
  `ProjectGraph` по активному щиту (RULES § 5.2).
- Интерактивный график ВТХ `TccCurveChart.tsx` на SVG: логарифмические оси
  $t(I)$, кривые B/C/D вышестоящего и нижестоящего аппаратов, вертикальная
  линия $I_{кз}^{(1)}$, маркер $I_s$, бейджи статуса селективности и проверки
  $I_{cn}$, подсказка при наведении. Вызов `POST /projects/:id/selectivity-tcc`
  с детерминированным локальным предпросмотром при недоступности сервера.
- Седьмой офлайн-шаблон `07_twostory_house_vru_shr`: двухэтажный дом с ВРУ,
  двумя ЩР и магистральными линиями; карточка галереи показывает бейдж
  «2 щита: ВРУ + ЩР-2».
- `gostPdfExport.ts`: при нескольких щитах комплект дополняется парой листов
  «Однолинейная схема щита» и «Компоновка щита» для каждого щита, с единой
  нумерацией и штампом по ГОСТ Р 21.101.

- Серверная интеграция ВТХ: `CalcEngineClient.checkSelectivityTccAsync` с
  таймаутом и Zod-валидацией ответа, ручка `POST /projects/:id/selectivity-tcc`
  и сборка запроса из графа (`buildSelectivityRequest`): аппараты цепочки,
  каскадная и групповая потери напряжения. Числа приходят только из
  `calc-engine` (RULES § 5.1).
- `scripts/e2e-smoke.mjs` прогоняет седьмой многощитовой кейс
  `07_twostory_house_vru_shr`: проверяет каскадное $\Delta U \le 5\%$, вызывает
  `POST /projects/:id/selectivity-tcc` и сверяет протокол ВТХ с эталоном.
  Успешный прогон — 379 проверок по 7 кейсам.

### Changed

- Дополнительные вкладки (однолинейная схема, спецификация), форма выпуска РД
  и график ВТХ переведены на `React.lazy`: основной чанк web-клиента уменьшен
  до ~783 КБ, сборка проходит без предупреждений Vite о размере.
- Tauri v2: невалидное разрешение `fs:allow-save` заменено на корректный набор
  `core:default`, `dialog:default`, `dialog:allow-open`, `dialog:allow-save`,
  `fs:default`, `fs:allow-read-text-file`, `fs:allow-write-text-file` с областью
  `**/*.vwc`. Крейты `tauri-plugin-dialog`/`tauri-plugin-fs` и их вызовы в
  `tauri::Builder` уже были подключены; версия в `Cargo.toml` синхронизирована с
  `tauri.conf.json` (0.5.0). Устраняет падение workflow Release Desktop на
  этапе компиляции Rust.

### Added (бэкенд v0.6.0)

- `packages/shared`: обратно совместимое расширение v2 — `panelRole`,
  `parentPanelId`, `breakingCapacityKa` у узлов, `feeder_line` и
  `upstreamVoltageDropPercent` у рёбер; контракты `SelectivityTccRequest/Response`
  со статусом `full | partial | none`, пределами Is и точками кривых ВТХ.
- `apps/calc-engine`: детерминированный модуль `tcc_selectivity.py` и эндпоинт
  `POST /v1/calc/selectivity-tcc` — кусочно-аналитические кривые B/C/D
  (1,13 / 1,45 / 2,55 In и 3–5 / 5–10 / 10–20 In), предел селективности Is
  с Δt = 0,1 с, проверка I_cn ≥ I_кз, точки кривых и каскадное ΔU.
- Каскадный расчёт: `line_sizing.py` учитывает потерю на магистрали ВРУ → ЩР
  (ΣΔU ≤ 5 %), `short_circuit.py` добавляет сопротивление вышестоящей петли
  при расчёте тока КЗ в конце линии.
- `apps/api`: инструмент `check_tcc_selectivity_tool` в `ToolRegistry`, его вызов
  в `PueAuditorAgent` (новое замечание `PUE-SELECT-TCC` и цитаты справочника
  `TCC_SELECTIVITY_V06.md`), поддержка `targetPanelId` в `PanelArchitectAgent`
  и клиентский метод `checkSelectivityTccAsync`.
- Золотой датасет расширен до семи кейсов: `07_twostory_house_vru_shr` содержит
  ВРУ, ЩР-2, фидер ВВГнг(А)-LS 5×6 мм², каскадное ΔU и эталон результата ВТХ;
  регрессионные тесты pytest/Vitest обновлены.
- Тесты: 16 новых `pytest` на ВТХ/каскад и 4 новых Vitest на инструмент,
  клиент, аудит и сборку выбранного щита.

## [0.5.0] — 2026-11-20

### Added

- `docs/development/v0.5/DESIGN_V050_3PHASE_DWG_TEMPLATES.md` — дизайн релиза
  v0.5.0 по 8 обязательным секциям RULES § 2.14: трёхфазная автосборка щита
  (`KI-007`), двухступенчатый конвейер `DWG → DXF → ezdxf` (`KI-005`),
  Docker profile `s3` (`KI-006`), расширение библиотеки шаблонов до шести
  объектов, lazy-загрузка 3D-вкладки и заполненная таблица решений.
- `React.lazy` + `Suspense` для вкладки «3D-щит (НКУ)»: Three.js и `Panel3DView`
  вынесены в отдельный чанк (~544 КБ); основной чанк уменьшен до ~799 КБ,
  предупреждение Vite о лимите 800 КБ больше не возникает. Добавлен скелетон
  загрузки и предзагрузка чанка при наведении на вкладку.
- Библиотека встроенных офлайн-шаблонов расширена до шести объектов:
  `04_commercial_office_400v`, `05_cottages_3phase_15kw`,
  `06_apartment_2room_gas`. Карточки выбора показывают фазность, расчётную
  мощность и число групп; в шапке проекта отображается бейдж фазности.
- Диалог импорта чертежей принимает `.dxf` и `.dwg`; во время разбора
  показывается индикатор прогресса, а при отсутствии серверного конвертера
  выводится сообщение из ответа API с подсказкой по `ODA_CONVERTER_PATH`.

### Changed

- Разделы 6.1, 7.2 и новый раздел 10.5 `docs/development/v0.1/UI_EDITOR.md`
  обновлены под шесть шаблонов, lazy-загрузку и обработку ошибок DWG-импорта.

### Added (бэкенд v0.5.0)

- KI-007 закрыт: `PanelArchitectAgent` и инструменты мутации графа извлекают
  топологию ввода из `input_source.specs.phase/voltageV` и
  `ProjectGraph.meta.supplyTopology/panelPoles` и передают `phases: 3`,
  `voltageV: 400` в `POST /v1/calc/auto-panel`. В `calc-engine` мощные приборы
  делятся на пофазные подгруппы, локальный поиск минимизирует перекос; на кейсе
  `02_apartment_3room_400v` он равен 3,47 % (≤ 15 %).
- Каталог дополнен 3P/4P автоматами, трёхфазным реле напряжения и
  селективными УЗО 4P типа `S` 100/300 мА; `CatalogService.findByTypeAsync`
  поддерживает фильтры по полюсам и уставке УЗО.
- KI-005 закрыт: `POST /v1/cad/parse-dxf` принимает `.dwg`, конвертирует через
  `ODA_CONVERTER_PATH` или `dwg2dxf` в изолированной временной директории
  (`subprocess.run` со списком аргументов, без `shell=True`, таймаут 30 с),
  затем разбирает DXF существующим парсером стен. Мок-тесты покрывают успех,
  таймаут и отсутствие конвертера.
- Золотой датасет расширен до шести кейсов: добавлены
  `04_commercial_office_400v`, `05_cottages_3phase_15kw`,
  `06_apartment_2room_gas`. Генератор добавляет `input_source` и `meta`,
  регрессионные тесты `pytest`/Vitest параметризованы на все шесть комплектов.
- KI-006 закрыт: сервис `minio` вынесен в Docker Compose profile `s3`. Базовая
  команда `docker compose up -d` поднимает пять обязательных сервисов без
  обращения к проблемному образу; S3 включается `--profile s3`.
- `apps/calc-engine/Dockerfile` собирает LibreDWG из исходников и включает
  `dwg2dxf`/`dxf2dwg`, поэтому конвертация DWG работает из коробки без ODA.
  Добавлены `DWG_CONVERTER_TYPE` (`auto|oda|libredwg|none`) и
  `ODA_CONVERTER_PATH` в `config.py`, compose и `.env.example`.
- `scripts/e2e-smoke.mjs` прогоняет все шесть кейсов золотого датасета,
  проверяет трёхфазный баланс ≤ 15 % для `02` и `05` и отдельно тестирует
  конвертацию `dwg/plan.dwg` через расчётное ядро. Успешный прогон — 312 проверок.
- `docs/development/GETTING_STARTED.md` обновлён: профили Compose, переменные
  конвертера DWG, многокейсовый smoke и DWG-тест.

### Fixed

- KI-005 и KI-007 переведены в статус `Fixed` (2026-11-20); реестр пересчитан.
- KI-006 переведён в статус `Fixed`: `docker compose config --services` по
  умолчанию возвращает пять сервисов, с `--profile s3` — шесть.

### Changed

- `DESIGN_V050` § 8: все пять решений переведены в статус «Утверждено»
  Архитектором и Владельцем продукта 2026-11-20.

## [0.4.0] — 2026-11-20

### Added

- `docs/development/v0.4/DESIGN_V040_COPILOT_3D_GOST_DOCS.md` — дизайн релиза
  v0.4.0 по 8 обязательным секциям RULES § 2.14: безопасная мутация графа
  через `GraphPatchProposal` с подтверждением и Undo/Redo, пятая проекция
  графа «3D-щит» на Three.js, генератор комплекта РД по ГОСТ Р 21.101
  с опциональным `stampMeta`, золотой датасет и план работ.
- `fixtures/golden-dataset/README.md` — описание трёх эталонных объектов
  (квартира 230 В, квартира 400 В с мастер-выключателем и мокрыми зонами,
  дом ИЖС с 80-метровой трассой на баню) и таблица ожидаемых инженерных
  показателей для сквозного smoke-теста в Docker.

- Полный запуск системы одной командой: `docker-compose.yml` дополнен сервисами
  `api` и `web` (multi-stage Dockerfile-ы, nginx для статики), `depends_on` с
  `condition: service_healthy`; API при старте применяет Drizzle-миграции и сиды
  каталога/нормативов.
- `scripts/e2e-smoke.mjs` и команда `pnpm smoke:e2e`: сквозной прогон «Золотого
  датасета» по живому API (health, загрузка `.vwc`, импорт `plan.dxf`, расчёт
  линий, сборка щита, ток КЗ, аудит ПУЭ) со сравнением с `expected_calc.json`.
- Фикстура `fixtures/golden-dataset/02_apartment_3room_400v/`: `project.vwc`
  (schemaVersion 2), `plan.dxf` и `expected_calc.json`.
- `docs/development/GETTING_STARTED.md` — подробная инструкция запуска в Docker
  и прогона smoke-теста.
- Интерактивный ИИ-чат-копилот в правой панели: лента сообщений, быстрые
  подсказки, вызов `POST /projects/:id/ai/chat`, карточка «Предлагаемые
  изменения» (`diffSummary`) с кнопками «Применить к проекту» / «Отклонить».
  Применение патча записывается в историю Undo; при недоступности сервера
  используется детерминированный локальный патч без расчётов (RULES § 5.4).
- Undo/Redo графа в `editorStore` (`Ctrl+Z` / `Ctrl+Y`, кнопки в шапке) и меню
  «Демо-проекты» с тремя эталонными кейсами золотого датасета, загружаемыми
  на холст мгновенно и без сети.
- Пятая вкладка «3D-щит (НКУ)» (`Panel3DView`) на базе Three.js: интерактивная
  сцена с управлением OrbitControls (вращение/зум), корпусом,
  DIN-рейками, 3D-модулями из `panelSlot`, цветовой маркировкой фаз, рычажками
  взвода, маркировкой QF/QD и шинами N/PE. Сцена — проекция единого `ProjectGraph`.
- Клиентский генератор комплекта РД по ГОСТ Р 21.101 (`gostPdfExport.ts`) и
  форма реквизитов штампа (`GostDocsPanel.tsx`): единый четырёхлистовой PDF
  «Общие данные», «Однолинейная схема», «Компоновка щита НКУ», «Кабельный
  журнал и Спецификация» с рамкой и основной надписью; кириллица выводится
  через Canvas без внешних шрифтов, офлайн-режим Tauri сохранён.
- Опциональный блок `stampMeta` в `ProjectGraphSchema` (шифр, разработчик,
  проверяющий, организация, стадия) — старые `.vwc` v2 читаются без миграции.

### Changed

- `DESIGN_V040` § 8 заполнен утверждёнными решениями: генератор РД — клиентский
  на `jsPDF` для офлайн-Tauri; комплект из 4 листов с основной надписью по
  ГОСТ Р 21.101; история чата копилота хранится в сессии клиента и передаётся
  в `POST /projects/:id/ai/chat`; золотой датасет проверяет точные
  `Decimal`-вычисления с допусками ±5 % по токам и ±0,5 п. п. по ΔU.

### Fixed

- Путь к `docs/domain/PUE_RULES_V02.md` в `db:seed:normatives` исправлен с трёх
  уровней на четыре: сид пытался читать `apps/docs/domain/...`, из-за чего
  падал шаг миграций и сидов в CI.
- В зависимости расчётного ядра добавлен `python-multipart`: FastAPI
  использует форму загрузки CAD-файлов, без пакета pytest падал при сборе
  тестов в CI.
- Запуск API в контейнере: добавлены явные `@Inject(ConfigService)` в
  `PgPoolService`, `RedisService` и `HealthService`, убран глобальный
  `ValidationPipe` (packages `class-validator` нет — входные данные проверяются
  Zod). SQL-миграции копируются в образ рядом с `migrate.js`.
- Контракты расчётного ядра приведены к графу v2: `AutoPanelNode` принимает
  `catalogDeviceId`, а `phaseLoads` сериализуется с ключами `L1/L2/L3` —
  автосборка щита перестала падать с HTTP 422/502 на эталонном проекте.
- `calculateShortCircuit` использует узел `panel` как источник номинала, если
  в графе нет отдельного автомата (эталонный датасет содержит вводной щит).

### Added (бэкенд v0.4.0: датасет и ИИ-чат)

- `scripts/generate-golden-dataset.py` — воспроизводимый генератор трёх
  эталонных комплектов (детерминированные UUID v5): `01_studio_230v`,
  `02_apartment_3room_400v`, `03_house_bath_long_line`. Каждый содержит
  `plan.dxf` (ezdxf, `$INSUNITS=4`), `project.vwc` (`schemaVersion: 2`)
  и `expected_calc.json` — снимок результатов line-sizing/short-circuit
  с входными параметрами групп.
- Регрессионные тесты по датасету: 4 `pytest` (разбор DXF, валидация графа v2,
  точное воспроизведение всех расчётов) и 7 Vitest (Zod-валидация `.vwc`,
  совпадение мощностей и числа стен/линий с эталоном).
- `packages/shared/src/graph.schema.ts`: `stampMeta` (штамп ГОСТ Р 21.101),
  `CopilotChatRequestSchema` / `CopilotChatResponseSchema` с `reply`,
  опциональным `proposedGraph`, `diffSummary` и `toolCalls`.
- `apps/api/src/agents/`: три инструмента мутации графа
  (`add_master_switch_tool`, `split_appliance_line_tool`,
  `rebrand_panel_tool`) с обязательным пересчётом щита/линий в `calc-engine`
  и подбором артикулов из `catalog_devices`; `CopilotChatAgent` возвращает
  патч-предложение без записи в БД.
- Эндпоинт `POST /projects/:id/ai/chat`: предложение применяется штатным
  `PUT /projects/:id/graph` после подтверждения пользователем (RULES § 5.1,
  § 5.2). Тесты с моками LLM и calc-engine подтверждают, что числа приходят
  только из инструментов.

### Documented

- `KI-006`: образ `minio/minio:latest` недоступен в части registry; по умолчанию
  используется `STORAGE_DRIVER=local`, S3 остаётся опциональным.
- `KI-007`: передача трёхфазного режима ввода из `meta` в `PanelArchitectAgent`
  запланирована на `v0.5.0`.
- Сводка реестра пересчитана по RULES § 3.9: Fixed 3, Documented 1,
  Deferred 2, Resolved 1, всего 7 записей.

## [0.3.0] — 2026-11-19

### Added

- `docs/development/v0.3/DESIGN_V030_CAD_SHORT_CIRCUIT_DESKTOP.md` — дизайн
  релиза v0.3.0 по 8 обязательным секциям RULES § 2.14: изолированный конвейер
  разбора DXF/DWG, миграция графа `schemaVersion: 1 → 2` в СИ, расчёт
  однофазного тока КЗ и селективности, нативный мост Tauri, живые цены
  спецификации, план работ на 14–16 дней и риски.
- `docs/domain/PUE_SHORT_CIRCUIT_V03.md` — правила проверки петли «фаза-ноль»
  (ПУЭ-7 гл. 1.7, время отключения ≤ 0,4 с при 230 В), кратности расцепителей
  B/C/D (3–5 / 5–10 / 10–20 `I_n`) и токово-временной селективности.

- Зависимость `ezdxf` в `pyproject.toml` и `requirements.txt` расчётного ядра —
  основа изолированного конвейера разбора DXF (RULES § 5.5).
- `apps/calc-engine/app/config.py`: валидация лимитов `CAD_MAX_FILE_SIZE_MB=50`
  и `CAD_PARSE_TIMEOUT_SEC=30` при старте, проверка размера файла и
  непривилегированный пользователь в Dockerfile для разбора CAD-файлов.
- Публичный `CatalogController`: `GET /catalog/devices` с фильтрами `brand`,
  `deviceType`, `ratedCurrentA` и пагинацией; запрос и ответ валидируются Zod
  (основа для закрытия `KI-004`). Интеграционные тесты каталога на PGlite.
- `.github/workflows/ci.yml`: экшены обновлены до `checkout@v7`,
  `setup-node@v7`, `setup-python@v7`, `pnpm/action-setup@v6`; включён
  `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`. В job `Node` добавлен сервис
  `pgvector/pgvector:pg17` и шаг `db:migrate` + `db:seed` + `db:seed:normatives`
  на реальной БД — `KI-002` закрыт.
- `.github/workflows/release-desktop.yml`: ручной запуск и триггер по тегу `v*`,
  matrix-сборка Tauri на Windows (`.msi`/`.exe`) и Linux (`.AppImage`) с
  загрузкой артефактов. В `web` добавлен `@tauri-apps/cli`, включён `bundle.active`
  и иконки приложения.

### Changed

- `DESIGN_V030` § 8 заполнен утверждёнными решениями: DXF разбирается нативно
  через `ezdxf`, DWG — через опциональный `ODA_CONVERTER_PATH` с явной
  диагностикой; селективность — `I_{n,верх} ≥ 1,6 · I_{n,низ}` и тип `S` для
  вводного противопожарного УЗО; каталог кэшируется на сессию проекта с
  ручным обновлением прайса и офлайн-фолбэком в Tauri; артефакты `.msi/.exe`
  и `.AppImage` в `v0.3.0` собираются без цифровой подписи.
- `PUE_SHORT_CIRCUIT_V03.md` синхронизирован с `apps/calc-engine/app/short_circuit.py`:
  критерий гарантированного отключения использует верхнюю границу характеристики
  (B — 5, C — 10, D — 20 `I_n`), а селективность — отношение 1,6 и кривую
  вводного аппарата не быстрее группового; поля протокола приведены к
  `ShortCircuitResponse`.
- Версии GitHub Actions и конфигурация Tauri приведены к актуальным; сборка
  десктопа вынесена в отдельный workflow, не блокирующий основной CI.

### Fixed

- `KI-002`: миграции и сиды теперь проверяются в CI на реальном PostgreSQL 17
  с расширением `vector`, а не только на PGlite.

## [0.2.0] — 2026-11-19

### Added

- `docs/development/v0.2/DESIGN_V020_CALC_AND_AI_AGENTS.md` — дизайн релиза
  v0.2.0 по 8 обязательным секциям RULES § 2.14: конвейер «план → ИИ-агент →
  расчётное ядро → валидированный граф → схема и щит», срезы расчёта, каталога
  оборудования, агентов и вкладки «Щит и Однолинейная схема», миграция схемы
  v1 → v2, план работ, границы и риски.
- `docs/domain/PUE_RULES_V02.md` — стартовый справочник для RAG и валидации
  ядра: допустимые длительные токи ВВГнг(А)-LS, соответствие «сечение →
  номинал АВ», правила УЗО/АВДТ (30/10 мА, противопожарное 100/300 мА) и
  балансировка трёхфазного ввода 400 В с перекосом не более 15 %.

- Таблицы `catalog_devices` и `normative_chunks` в схеме Drizzle: справочник
  модульного оборудования (бренд, серия, артикул, тип, полюса, номинальный ток,
  кривая расцепителя, уставка утечки, коммутационная способность, ширина в
  модулях, цена, характеристики в JSONB) и фрагменты ПУЭ-7 / СП 256 с
  `vector(1536)` для RAG. Миграция `0001_talented_emma_frost.sql` создаёт
  расширение `vector`, HNSW-индекс `vector_cosine_ops` и уникальный ключ
  `(document_code, clause)`.
- Сид каталога: `catalog-seed-data.ts` (40 ходовых позиций IEK, EKF, КЭАЗ:
  автоматы 6–63 А кривых B/C, УЗО 25–63 А на 30/100/300 мА, АВДТ 16/25 А
  30 мА, реле напряжения, кросс-модули и корпуса НКУ на 12/24/36/54 модуля)
  и команда `pnpm --filter api db:seed` с идемпотентной вставкой по артикулу.
- Настройки LLM-роутера в `EnvSchema` и `.env.example`: `LLM_BASE_URL`,
  `LLM_API_KEY`, `LLM_MODEL`, `EMBEDDING_MODEL` — OpenAI-совместимый облачный
  API и локальные LM Studio / Ollama.
- `CalcEngineClient` с таймаутом через `AbortController` и Zod-валидацией
  ответов расчётного ядра; ручка `POST /projects/:id/calculate` прогоняет все
  линии графа через calc-engine и возвращает суммарную длину и статус каждой
  линии (математика остаётся только в ядре, RULES § 5.1).

### Changed

- `DESIGN_V020` § 8 заполнен утверждёнными решениями: разбор DXF/DWG перенесён
  на `v0.3.0`; базовый способ прокладки — в трубе / скрыто в штробе
  (ПУЭ-7 табл. 1.3.4); версия графа `schemaVersion: 2` с чтением `v1`;
  облачные и локальные OpenAI-совместимые модели через `LLM_BASE_URL` при
  строгом запрете расчётов внутри модели (RULES § 5.1).
- В `DESIGN_V020` § 3.1.1 зафиксирована спецификация миграции
  `schemaVersion: 1 → 2`: перевод `waypointsPx` в `waypointsM` через
  `scaleMetersPerPx`, назначение `panelSlot`, резервная копия `.vwc.v1.bak`
  и валидация результата `ProjectGraphSchema` v2.
- `PUE_RULES_V02.md`: базовая колонка допустимых токов — «В трубах и каналах»
  вместо варианта «на воздухе».

- `ProjectsService` и `ProjectsController` расширены расчётом графа; независимые
  линии пересчитываются через `Promise.allSettled` (RULES § 4.13).
- Интеграционные тесты API на PGlite пропускают pgvector-зависимые операторы
  миграции: встроенная БД не поддерживает расширение `vector`; проверка таблиц
  `projects`, `floor_plans`, `catalog_devices` сохранена.

### Fixed

- Исключён из `.gitignore` исходный код `apps/api/src/projects/storage/floor-plan-storage.ts`:
  шаблон `storage/` скрывал модуль хранилища подложек, из-за чего CI не мог
  выполнить typecheck и сборку API.

## [0.1.0] — 2026-11-19

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

### Added (UI релиза v0.2.0)

- Вкладки рабочей области в `App`: «План помещений», «Компоновка щита (НКУ)»,
  «Однолинейная схема», «Спецификация». Все четыре проекции читают один и тот же
  `ProjectGraph` из `editorStore` (RULES § 5.2); переключение вкладок не меняет граф.
- `PanelLayoutEditor` + `lib/panelModules.ts`: SVG-компоновка щита на DIN-рейках
  по 18 модулей в ряд; ширина модуля 18 мм, типы УГО занимают 1–4 модуля,
  маркировка `QF1`/`QD1`, номинал `C16` / `25А 30мА`, цветовая индикация фаз
  L1/L2/L3. Клик по модулю выделяет узел в общем графе и открывает его свойства.
- `SingleLineDiagramView` + `lib/diagramExport.ts`: автоматическая древовидная
  однолинейная схема по ГОСТ из узлов и рёбер графа с подписями кабеля, сечения,
  длины, мощности и тока; экспорт в SVG, PNG и PDF (jsPDF).
- `BillOfMaterialsTable` + `lib/bomExport.ts`: сводная спецификация кабелей
  (группировка по марке/сечению/жилам, суммарная длина) и аппаратов защиты
  (артикул, цена, сумма), экспорт в CSV (с BOM) и XLSX.
- Выдвижная панель `AiAssistantDrawer`: кнопки «Собрать щит с ИИ» и «Аудит по
  ПУЭ-7»; методы клиента `assemblePanelAsync` / `auditPueAsync` с Zod-валидацией
  ответов. Клик по замечанию аудита выделяет проблемный узел/линию и открывает
  схему или спецификацию.
- `InspectorPanel`: редактирование номинала автомата (`specs.ratedCurrent`, А);
  изменение сразу обновляет компоновку щита и однолинейную схему (Graph-First).
- Новые тесты UI: модули/фазы щита, построение спецификации, фокус замечаний
  аудита, AI-методы API-клиента (35 тестов в `apps/web`).

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

### Added (расчёты и агенты v0.2.0)

- Контракты `packages/shared/src/graph.schema.ts`: `LineSizingRequest/Response`,
  `AutoPanelRequest/Response`, `PueAuditReportSchema` с привязкой находок к ID
  пунктов `docs/domain/PUE_RULES_V02.md` (SECTION `PUE-*`).
- `apps/calc-engine`: `POST /v1/calc/line-sizing` — расчётный ток для 1/3 фаз,
  потеря напряжения ≤ 5 %, подбор сечения ВВГнг(А)-LS 1.5–16 мм² по ПУЭ
  1.3.4 (в трубе/штробе), номинал АВ и уставка УЗО 10/30 мА; все расчёты —
  в `Decimal`.
- `apps/calc-engine`: `POST /v1/calc/auto-panel` — группировка потребителей
  по помещениям, отдельные линии для приборов > 2000 Вт, балансировка L1/L2/L3
  с контролем перекоса ≤ 15 %, расстановка модулей по `panelSlot` и корпус
  с +20 % резерва.
- `apps/api/src/agents/`: `LlmClient` (OpenAI-совместимый `LLM_BASE_URL`, только
  пояснения), `ToolRegistry` с инструментами `calculate_line_tool`,
  `auto_assemble_panel_tool`, `inspect_pue_rules_tool`, `CatalogService`,
  `NormativeService`, `PanelArchitectAgent` и `PueAuditorAgent`. Математика
  выполняется только в `calc-engine` (RULES § 5.1).
- `CalcEngineClient`: методы `calculateLineSizingAsync` и
  `autoAssemblePanelAsync` с Zod-валидацией ответов и таймаутом.
- `apps/api/src/database/seed-normatives.ts` — парсер справочника ПУЭ-7 в
  `normative_chunks` с детерминированными ключевыми эмбеддингами; команда
  `pnpm --filter api db:seed:normatives`.
- Эндпоинты `POST /projects/:id/ai/assemble-panel` и
  `POST /projects/:id/ai/audit-pue`; обновлённый граф сохраняется через
  `ProjectsService.updateGraphAsync` после Zod-валидации.
- Тесты: 31 юнит-тест `pytest` для line-sizing и auto-panel (включая баню
  с кабелем 80 м и перекос фаз), 13 тестов Vitest для агентов, сида, клиента
  и эндпоинтов с моком LLM и проверкой вызовов calc-engine.

### Documented

- `KI-003`: миграция графа `schemaVersion: 1 → 2` перенесена на `v0.3.0`;
  спецификация зафиксирована в `DESIGN_V020` § 3.1.1. Физические длины
  вычисляются в СИ детерминированным ядром, неверных результатов нет.
- `KI-004`: цены в спецификации берутся из локальных констант, а не из
  API-каталога; синхронизация прайса перенесена на `v0.3.0`.
- Сводка реестра после пересчёта (RULES § 3.9): Fixed — 1, Documented — 1,
  Deferred — 2, всего 4 записи.
- `KI-003` и `KI-004` переведены в `Fixed` в разделе UI v0.3.0 ниже; итоговая
  сводка: Fixed — 3, Resolved — 1, всего 4 записи.

### Added (UI релиза v0.3.0)

- Адаптация `apps/web` к канонической `ProjectGraphSchema` версии 2: импорт
  `.vwc` v1 и загрузка с сервера проходят через `parseVwcFile` /
  `migrateProjectGraphV1ToV2`; экспорт записывает схему v2 с `waypointsM`.
- Векторный слой стен `graph.walls` на `FloorPlanEditor` и магнитное прилипание
  ЭУИ к стенам в радиусе 0,2 м (`lib/snap.ts`); кнопка «Импорт DXF/DWG»
  вызывает `POST /projects/:id/import-cad` и добавляет нормализованные стены в граф.
- `KI-004` закрыт: `GET /catalog/devices` с кэшем в `uiStore` (TTL 5 минут,
  кнопка «Обновить прайс»), реальные артикулы и цены в `BillOfMaterialsTable`
  и экспорте CSV/XLSX, фолбэк на локальный справочник в офлайн-Tauri.
- Отображение расчётного тока КЗ, потери напряжения и зелёного/красного
  бейджа селективности в `InspectorPanel` и `SingleLineDiagramView`; кнопка
  «Расчёт КЗ» запускает `POST /projects/:id/short-circuit`.
- Нативные диалоги Tauri: плагины `dialog`/`fs` в `src-tauri` (Rust + capabilities),
  адаптер `lib/tauriAdapter.ts`, `saveProjectAsync` / `openProjectAsync`
  в `persistence.ts`; в среде Tauri кнопки сохраняют/открывают `*.vwc` через ОС,
  в браузере остаётся скачивание (RULES § 5.4). Индикатор «Офлайн (Tauri)» в шапке.
- Новые строки UI добавлены в `ru.json` / `en.json`; тесты web расширены
  (миграция v1→v2, каталог, CAD-контракты, прилипание к стенам).

### Added (бэкенд релиза v0.3.0)

- `packages/shared/src/graph.schema.ts`: канонический `ProjectGraphSchema`
  `schemaVersion: 2` с обязательными `waypointsM`, расчётными полями
  `cableSpecs` (`calculatedCurrentA`, `voltageDropPercent`,
  `shortCircuitCurrentA`) и `catalogDeviceId` в узлах. Добавлены
  `ProjectGraphSchemaV1`, `VwcFileSchemaV1`, `parseVwcFile`; v1 мигрируется
  автоматически, данные и ссылки сохраняются (KI-003).
- Детерминированный `migrateProjectGraphV1ToV2` (и вариант с отчётом): перевод
  `waypointsPx × scaleMetersPerPx` в метры с точностью 1 мкм, назначение
  `panelSlot` для модулей щита и `catalogDeviceId = null`; покрыт юнит-тестами.
- `apps/calc-engine`: `POST /v1/calc/short-circuit` — петля «фаза-ноль»,
  минимальный ток КЗ, кратности B=5 / C=10 / D=20, время отключения и
  селективность 1,6×; вычисления в `Decimal`, ссылки на `PUE_SHORT_CIRCUIT_V03`.
- `apps/calc-engine`: `POST /v1/cad/parse-dxf` — разбор `LINE`/`LWPOLYLINE`
  через `ezdxf` в стены со слоями wall/partition/door/window, нормализация
  `$INSUNITS` (мм/см/м/дюйм) в метры, лимит 50 МБ, таймаут 30 с, предел
  сущностей и POSIX-ограничения памяти/CPU в отдельном воркере.
- `apps/api`: инструмент `check_short_circuit_tool`, метод
  `CalcEngineClient.checkShortCircuitAsync`, вызов КЗ в `PueAuditorAgent`,
  эндпоинты `POST /projects/:id/short-circuit` и `POST /projects/:id/import-cad`,
  метод `ProjectsService.importCadAsync` с добавлением стен в граф.
- Тесты: 22 новых `pytest` (КЗ и CAD), 6 новых Vitest (клиент, инструмент,
  аудит, импорт CAD); `pnpm build/test/lint/typecheck` зелёные.

### Fixed

- KI-003 закрыт: граф v1 автоматически мигрирует в v2 без потери данных;
  расчётные координаты трасс хранятся в метрах СИ.
