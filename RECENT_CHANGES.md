# Recent Changes — open-geo

Running-log архитектурных/модельных решений, вынесенный из [CLAUDE.md](CLAUDE.md) (раньше
занимал почти половину файла). Newest-on-top, формат `YYYY-MM-DD — что/почему`. Авторитет и
док-дисциплина (порядок правок, критерий «готово») остаются в `CLAUDE.md` → Conventions;
любая значимая архитектурная/модельная правка добавляет строку сюда.

- 2026-06-22 — **doc-sync (--fix): формулировка ingest в README (EN/RU/ZH/AR) приведена к инкрементальной.**
  Раздел «How it works» п.3 во всех четырёх README утверждал, что оркестратор «собирает всё и делает один
  центральный ingest» — это описывало ровно запрещённый паттерн «ingest одним батчем в конце» и расходилось
  с `INTERFACES.md` §1/§2.1, `SKILL.md` STEP 4.1 и gotcha в `CLAUDE.md` (ingest идёт инкрементально, чанк за
  чанком, как воркеры возвращаются — durability/resume). Переформулировано: оркестратор владеет всеми
  записями в БД и ingest-ит чанк каждого воркера сразу по возвращении. Тронуты только README (доки);
  контракт/код/CLI/БД-схема не менялись. Триггер — `/doc-sync --fix`.

- 2026-06-22 — **PDF-отчёт корректно рендерит zh (中文) и ar (العربية): бандл OFL-шрифтов + Arabic shaping/bidi/RTL.**
  Раньше `report.generate --lang zh|ar` давал валидный PDF, но нечитаемый: zh — пустые квадраты (DejaVu без
  CJK-глифов, ~42 matplotlib-warning «Glyph missing»), ar — буквы несоединённые и в обратном порядке (нет
  shaping/bidi). Дашборд оба показывал верно. Закрыто целиком. **(1) Бандл шрифтов** в `fonts/` (новые
  `fonts/build.py` + `fonts/README.md` + OFL-тексты): **Noto Sans SC** (zh; субсет GB2312 ~6.7k иероглифов +
  chrome, ~2 МБ/начертание) и **Noto Naskh Arabic** (ar; полное покрытие), Regular+Bold, инстансированы из
  апстрим-VF (google/fonts, OFL 1.1) и слимлены (выкинуты layout/variation/vertical/hinting таблицы — Arabic
  шейпим сами); три глифа-стрелки дельт `▲▼▬` **синтезируются** в шрифт при сборке (их нет в сабсетах) →
  остаются OFL-only. **(2) Пер-язычный выбор шрифта** — `register_fonts(lang)` подменяет модульные
  `FONT/FONT_BOLD/FONT_OBLIQUE` (zh→Noto SC, ar→Noto Naskh, en/ru→DejaVu) и matplotlib `font.family`
  (fallback-стек); ReportLab пер-глифовый fallback не умеет, поэтому именно выбор, а не стек. **(3) Arabic
  shaping** — новый `report/textshape.py` (`arabic_reshaper`→`python-bidi`, добавлены в зависимости):
  reshape→bidi навешан на `canvas.draw*` (обёртка) и на matplotlib-метки; абзацы право-выравниваются
  (`Doc.rtl`). **(4) en/ru — байт-стабильны** (та же DejaVu, shape = no-op; два рендера различаются лишь
  волатильным ReportLab `/ID`). Тесты `tests/test_report_render.py` расширены (zh/ar в параметризации; guard
  «ноль Glyph-missing для zh»; shaping/bidi-санити для ar; en не встраивает Noto); покрытие `report` 100%,
  полный прогон зелёный. Verify: `seed_demo` → рендер en|ru|zh|ar (Acme/acme.com/google/all) — глифы и shaping
  корректны на всех 4. Доки: PDF-font-caveat убран из README(.ru) (переработаны владельцем), `CLAUDE.md`
  Stack+Gotcha, `requirements.txt` (+arabic-reshaper/+python-bidi), `.gitignore` (`fonts/.cache/`). Триггер — запрос пользователя.
- 2026-06-22 — **README: полная переработка под пользователя + мультиязычность (EN/RU/ZH/AR).**
  По запросу владельца README переписан как продуктовая витрина. Убраны разделы Usage / Languages-i18n /
  Project structure / Testing-CI и все упоминания роадмапа; «Команды» свёрнуты к одной `/open-geo` (без
  Python-CLI); Quick start переписан под Claude-флоу (clone → попросить Claude установить → команда) и
  показан запуск через `/loop`; добавлено простое объяснение воронки (queries → AI Overview → in sources →
  cited). В «Sample output» обложка PDF заменена страницей метрик (`assets/report-metrics.png`) + добавлены
  скриншоты дашборда на 4 языках (`assets/dashboard-{en,ru,zh,ar}.png`, ar — RTL); карточка в `assets/cover.svg`
  упрощена до `/open-geo`, буллеты — мультидвижковость + EN·RU·ZH·AR. Созданы `README.ru.md` (перезапись),
  `README.zh.md`, `README.ar.md` как переводы канона `README.md`. **Намеренное расхождение позиционирования:**
  по явному выбору владельца README подаёт мультидвижковость **смело** («любой AI-движок»), тогда как
  `CLAUDE.md` / `INTERFACES.md` / `engines/README.md` остаются честными (реализован только `google`, остальные
  движки — плейбуки к добавлению). Это маркетинговая витрина ≠ инженерная правда: **doc-sync НЕ должен
  откатывать README к «только Google»** без решения владельца. Тронуты только доки/ассеты; контракт/код/БД-схема
  не менялись (для скриншота демо-БД пересеяна `seed_demo --reset` + вручную добавлены демо-строки `lens_sentiment`).

- 2026-06-22 — **Захват стал durable: инкрементальный ingest + resume прерванного прогона + идемпотентный `(run_id,query,lens)`.**
  Раньше результаты писались в БД одним батчем в самом конце (SKILL STEP 4), а `ingest_batch` затирал счётчики и
  ставил `status='done'` на КАЖДОМ вызове — крах в середине (или потеря сессии-оркестратора до ingest) терял всё
  захваченное, а частичный прогон выглядел «done» (и не находился для resume). Теперь: **(1)** оркестратор ingest-ит
  **чанк каждого воркера сразу как тот вернулся** (INTERFACES §2.1, SKILL STEP 4.1) — крах не теряет уже захваченное;
  **(2)** `(run_id, query, lens)` — уникальный ключ результата (`UNIQUE INDEX idx_results_run_query_lens`; `insert_capture`
  → `INSERT … ON CONFLICT DO NOTHING RETURNING id`, возвращает `None` при дубле), `ingest` отдаёт `skipped` рядом с
  `ok`/`errors` (§3.2) — повтор/overlap/resume идемпотентны (без дублей и раздувания метрик); **(3)** `ingest` больше
  **НЕ** ставит `status`/`n_queries`/`n_failed`, держит лишь живой `n_ok = COUNT(results)` — финализирует прогон
  только скилл (STEP 4.2); **(4) resume** — прерванный прогон остаётся `status='running'`, скилл находит его
  `find_unfinished_run`, читает `get_captured_keys` и до-захватывает ТОЛЬКО недостающие `(query,lens)` в тот же run
  (SKILL STEP 1 «create OR resume» + STEP 2 фильтр). `init_db` само-мигрирует старую БД (дедуп `(run_id,query,lens)`
  по `MIN(id)` → создание уникального индекса; на live-БД 120 результатов сохранены, 0 дублей). Новые db-хелперы
  `get_captured_keys` / `find_unfinished_run`. Тесты обновлены под новый контракт ingest + новые на индекс/хелперы/
  миграцию/идемпотентность; полный прогон зелёный. Доки синхронизированы (INTERFACES §1/§2.1/§3.2, SKILL STEP 1/2/4,
  CLAUDE Gotchas).
- 2026-06-22 — **i18n: добавлены локали `zh` (中文) и `ar` (العربية) — теперь en/ru/zh/ar.**
  Полный перевод всех 135 UI-ключей в `i18n/zh.json` и `i18n/ar.json` (структура зеркалит `en.json`;
  брендовые имена `open-geo` / `AI Overview` / `AI Visibility Report` / `Google` и все `{placeholders}`
  сохранены дословно), реестр `i18n/locales.json` расширен. **Кода менять не пришлось**: фронт
  (`I18nProvider` → `/api/i18n`) и бэк (`dashboard/api.py`) читают реестр/словари динамически, а
  `report --lang` уже принимает любой зарегистрированный код (на чтении — fallback на `en` по ключу).
  `_DECIMAL_COMMA_LANGS` НЕ трогали: zh/ar используют точку как десятичный разделитель (в отличие от ru).
  Arabic — RTL: строки переведены и хранятся как есть (вместо `→` в `funnel_intro` использованы слова),
  но раскладка дашборда пока LTR (RTL-полировка — отдельная задача). **Известное ограничение PDF:**
  `report.generate` встроен на DejaVu Sans (латиница/кириллица) — en/ru рендерятся полностью; zh даёт
  пустые квадраты (нет CJK-глифов, ~42 matplotlib-warning на прогон), ar — глифы есть, но без shaping/bidi
  (`arabic_reshaper`/`python-bidi` не установлены) буквы несоединённые и в обратном порядке. PDF при этом
  валиден и не падает (exit 0); дашборд оба языка показывает корректно (шрифты браузера + shaping/RTL).
  Полноценный zh/ar в PDF — отдельная задача (бандл Noto Sans SC + Noto Naskh Arabic, `arabic_reshaper` +
  `python-bidi`, пер-язычный шрифт и RTL-абзацы). Добавлен guard-тест в
  `tests/test_report_i18n.py`: ни одна зарегистрированная локаль не содержит ключей вне контракта
  `en.json`. Доки синхронизированы (README / README.ru / dashboard/README / CLAUDE / SKILL / i18n/README).
- 2026-06-22 — **Дашборд: таблица «Результаты по запросам» сворачиваемая, по умолчанию свёрнута.**
  Таблица массивная (24 строки на прогон), поэтому в `RedesignApp` добавлен тоггл в `right`-слот панели:
  по умолчанию свёрнуто (строка-подсказка «N rows hidden»), кнопка разворачивает/сворачивает
  (`aria-expanded`, `ChevronDownIcon` с поворотом). Чистый UI — контракт/данные/БД не затронуты; новые
  i18n-ключи `dashboard.results_expand|results_collapse|results_collapsed_hint` (en+ru). Тоггл скрыт при
  0 строк (пустое состояние рендерится как раньше).

- 2026-06-22 — **Пер-срезовая качественная сводка тональности: новая таблица `lens_sentiment` + CLI `pipeline.lens_sentiment`.**
  Раньше тональность была только пер-запросной (`results.sentiment`) — читателю отчёта/дашборда приходилось
  глазами агрегировать десятки фраз по срезу. Добавлен качественный роллап: на финализе **оркестратор**
  (он и так LLM; SKILL новый STEP 5b) сворачивает `sentiment`-ы каждого среза (general/branded/comparative)
  в одну короткую нейтральную фразу + синтез `all` и пишет их через новый `python -m pipeline.lens_sentiment
  --run-id <N>` (JSON-объект `{lens: summary}` на STDIN; пайп через temp-файл ради UTF-8/кириллицы, как
  batch-ingest в STEP 4) в новую таблицу `lens_sentiment` (`UNIQUE(run_id, lens)`). **Почему отдельная
  таблица, а не `metrics`:** синтез пишет оркестратор, а `pipeline.aggregate` остаётся детерминированной
  математикой и на ре-агрегации `DELETE`+пересобирает `metrics` — в общей таблице он затирал бы прозу.
  Сводка **остаётся качественной** (текст, без балла/индекса/share-of-voice — правило §4 «нет числовой
  тональности» не нарушено) и следует **языку данных, не `--lang`**. Surfacing: дашборд — полоса карточек
  «Sentiment by lens» над таблицей результатов (`/api/metrics` пер-срезовые строки получают
  `sentiment_summary: string|null`); PDF — вводная строка существующей секции тональности. Read-only API
  дашборда `init_db` не вызывает → на старой БД без таблицы отдаёт «нет сводок» (ловит `no such table`), не
  падает; `init_db` создаёт таблицу (`CREATE TABLE IF NOT EXISTS`) для форвард-миграции. Авторитет —
  `INTERFACES.md` §2 (таблица + хелперы `upsert_lens_sentiment`/`get_lens_sentiments`), §3.4 (CLI), §4
  (нота про синтез). Триггер — запрос пользователя.
- 2026-06-22 — **Дашборд: график «Trend across runs» показывается только в режиме `all` (whole-period).**
  Тоггл периода раньше вообще не влиял на график — он рисовал все прогоны и при `today` (latest-run), и при
  `all`, т.е. контрол был «немым», а в latest-run полноразмерный мультисерийный тренд дублировал KPI-карточки
  (с дельтами к предыдущему прогону, которые и есть мини-тренд снапшота). Теперь панель тренда рендерится
  условием `period === "all"` в `RedesignApp.tsx`; latest-run — чистый снимок (карточки + дельты), без графика.
  Чисто презентационная правка (контракт/метрики/БД/CLI не затронуты): обновлены тесты в
  `RedesignApp.test.tsx` (latest-run скрывает график; тоггл на whole-period его раскрывает; empty-state тренда
  проверяется в whole-period) и строка про поведение в `dashboard/README.md`.

- 2026-06-22 — **Починка трёх проблем запуска, всплывших в боевом прогоне #6 (`/open-geo`, Аскона/`google`).**
  (1) **Форвард-миграция БД:** `pipeline.aggregate` падал на стейл-БД (`OperationalError: table metrics has no
  column named relative_citation`) — `init_db` использовал только `CREATE TABLE IF NOT EXISTS`, поэтому БД,
  созданная до ре-добавления `relative_citation` (2026-06-19), молча сохраняла старую схему. Теперь `init_db`
  добавляет недостающие колонки существующих таблиц через `ALTER TABLE … ADD COLUMN` (хелпер `_ensure_columns`;
  пока `metrics.relative_citation`): стейл-БД самочинится на следующем старте без ручного `DROP` и без потери
  данных (старые строки читаются как `NULL` до ре-агрегации). `INTERFACES §2` приведён под новое поведение
  (ручной `DROP` из note убран), добавлены регресс-тесты в `tests/test_db.py`, obsolete NOTE-комментарий из
  `db.py` удалён (конвенция «код без прозы»). (2) **Старт фоновых серверов:** команды дашборда в SKILL STEP 6
  использовали относительный `.venv/bin/python` и `cd dashboard/web` — в фоновом shell (CWD ≠ корень репо) это
  падало с exit 127. Заменено на абсолютные пути от `<REPO>` + `uvicorn --app-dir <REPO>` и
  `npm --prefix <REPO>/dashboard/web` (без `cd`); добавлен шаг `curl`-проверки health/HTTP перед выдачей URL; то
  же задокументировано в `dashboard/README.md`. (3) **`--lang` для дашборда:** `DEFAULT_LANG` был жёстко `"en"`
  без override, поэтому `--lang ru` не применялся к UI. `getInitialLang()` теперь читает `?lang=<code>` (приоритет
  URL-параметр → `localStorage` → `en`); SKILL отдаёт `http://localhost:5173/?lang=<lang>`; добавлены тесты в
  `i18n.test.tsx`, задокументировано в `dashboard/README.md`. Контракт `QueryCapture`/метрики/CLI/схема
  результатов НЕ менялись. Триггер — запрос пользователя.
- 2026-06-22 — **README: цифры демо-примера приведены к реальному выводу `seed_demo` (доковый дрейф с 2026-06-19).**
  Хедлайн, счётчики воронки, таблица «six metrics» и строка дельт в `README.md`/`README.ru.md` показывали
  старые значения (coverage 0.79, воронка 24→19→9→7 и т.д.) — артефакт до-воронкового сида: рефактор воронки
  2026-06-19 поменял генерируемые числа, но пример в README тогда не обновили. Приведено к авторитетному
  выводу детерминированного `seed_demo` (run 5, `lens=all`): воронка **24→20→12→9**, coverage 0.83,
  visibility_in_sources 0.60, visibility_in_citations 0.45, avg_source_position 2.50, relative_citation 0.75;
  дельты к run 4 пересчитаны (0.39→0.60 / 0.22→0.45 / 0.57→0.75 / 2.14→2.50). Только доки (код/контракт/сид —
  не трогались). Замечено при пересеве БД в ходе выравнивания `engine`→`google`.
- 2026-06-22 — **`engine`: синтетический seed/fixture/test-слой выровнен на `google` (сплит `google_ai_overview` убран целиком).**
  Раньше live-слой был на `google`, а демо/фикстура/тесты намеренно сидели на `google_ai_overview` как
  изолированное исключение — из-за чего **пример дашборда и обложка PDF показывали не тот id, что live**
  (репорт о баге от пользователя; перед публичным релизом это читается как нестыковка). Решение — убрать
  сплит: `google` теперь **везде**, в полном соответствии с авторитетом `INTERFACES.md` §1.1 (`engine` =
  basename плейбука). Тронуто: `pipeline/seed_demo.py`, `dashboard/seed_fixture.py`,
  `report/_selftest_fixture.py`, help-строки `--engine` в `pipeline/ingest.py`/`report/generate.py`, ~50
  ссылок в 9 Python-тест-файлах, фронтовый `dashboard/web/.../api.test.ts`; доки — гоча в `CLAUDE.md`,
  аннотация+curl в `dashboard/README.md`, примечание в `engines/README.md`, пример в `i18n/README.md`,
  подписи/alt в `README.md`/`README.ru.md`, правило исключений в `doc-sync/SKILL.md`. Пересеяны
  `data/aeo.db` (`seed_demo --reset`) и `_fixture_dash.db`; перегенерены `assets/sample-report-acme.pdf` +
  `assets/report-cover.png`. `engines/google.md` («do not substitute `google_ai_overview`») оставлен — guard
  по-прежнему валиден. Сид детерминирован → цифры демо не изменились, только метка движка. Тесты: pytest +
  vitest зелёные.
- 2026-06-22 — **`/doc-sync --fix`: Status-таблица `engines/README.md` канонизирована на `google` (пропуск в свипе 2026-06-20).**
  Строка implemented-движка в `engines/README.md` всё ещё показывала id `google_ai_overview` → `google.md`, что
  противоречило INTERFACES §1.1 (`engine` = basename плейбука), самому `engines/google.md` («do not substitute
  `google_ai_overview`») и live-докам; оператор, передав этот id, получил бы остановку прогона (нет
  `engines/google_ai_overview.md`). Свип канонизации engine→`google` от 2026-06-20 этот файл пропустил. Фикс: id →
  **`google`** + уточнение в примечании под таблицей, что синтетический seed/fixture/test-слой намеренно остаётся на
  `google_ai_overview`. Тронута только дока (код/контракт — нет); help-строки `--engine` (пример `google_ai_overview`)
  в `pipeline/ingest.py`/`report/generate.py` оставлены человеку. Триггер — `/doc-sync --fix`.
- 2026-06-22 — **`open-geo`: воркеры вынесены в сабагент `capture-worker`, добавлен визард параметров (STEP A), команда сделана user-only.**
  (1) Capture-воркеры теперь — именованный сабагент `.claude/agents/capture-worker.md` со своим `tools:`
  (Chrome-MCP + валидация); из `allowed-tools` оркестратора Chrome-тулзы убраны (он Chrome не водит),
  STEP 3 ужат до «спавни `capture-worker` + бриф», детальный контракт воркера переехал в файл агента
  (движко-агностичен; `engines/<engine>.md` инжектится как авторитет по движку, `INTERFACES §1` — по форме
  данных). (2) Новый STEP A: интро + структурный опросник недостающих параметров через `AskUserQuestion`
  (меню движков из `glob engines/*.md`, CSV из `glob`), с fast-path — при полном наборе аргументов визард
  пропускается (для loop/headless). Секция INVOCATION: «нет аргумента → визард», старый guard остаётся
  фолбэком. (3) `disable-model-invocation: true` — команда только по `/open-geo` (водит реальный Chrome +
  пишет БД); в `allowed-tools` добавлен `AskUserQuestion`. Контракт `QueryCapture`/метрики/CLI/БД НЕ
  менялись — это UX + границы прав + рефактор размещения инструкций. Триггер — запрос пользователя.
- 2026-06-22 — **Скилл `open-geo`: фикс гонки temp-файла + frontmatter; добавлены скиллы `bug-hunt` и `doc-sync`.**
  STEP 3: параллельные воркеры писали валидацию в общий `/tmp/cap.json` (гонка по shared `/tmp`) →
  теперь worker-unique `/tmp/open_geo_cap_<chunk-idx>.json` (в бриф воркера добавлен chunk index).
  Во frontmatter добавлены `argument-hint` и `allowed-tools` (Python/npm/uvicorn; Chrome-MCP + Task —
  дозаполняет /skill-creator), расширены триггеры `description`, закомментирована рекомендация
  `disable-model-invocation: true` (run водит реальный Chrome + пишет БД). Контракт/код/спека/метрики
  НЕ менялись — операционный фикс скилла + метаданные. Новые проектные скиллы: `bug-hunt` (один
  проверенный баг-фикс → PR, gate на тест-сьюте) и `doc-sync` (код ⇆ доки против `INTERFACES.md`,
  report-only по умолчанию). Триггер — запрос пользователя.
- 2026-06-22 — **Вынесен лог Recent Changes в отдельный файл `RECENT_CHANGES.md`.** Секция
  «Recent Changes» занимала почти половину `CLAUDE.md` (растущий running-log поверх стабильного
  reference-слоя). Лог перенесён сюда целиком (newest-on-top, `YYYY-MM-DD — что/почему`);
  в `CLAUDE.md` под заголовком `## Recent Changes` оставлен указатель на файл + конвенция
  обновления, а внутренние ссылки на «Recent Changes» (Conventions → док-дисциплина, Gotchas)
  перенаправлены сюда. Только реструктуризация доков — код/контракт/спека/метрики НЕ менялись.
  Триггер — запрос пользователя.
- 2026-06-22 — **Подготовка репозитория к публичному скачиванию с GitHub (git-гигиена, без правок кода).**
  Из индекса убраны два машинно-специфичных dev-конфига `**/.claude/launch.json`
  (`.claude/launch.json` + `dashboard/web/.claude/launch.json`) — `git rm --cached`, файлы остаются
  локально на диске, но больше НЕ коммитятся; добавлен паттерн `**/.claude/launch.json` в `.gitignore`
  (скилл под `.claude/skills/` по-прежнему трекается). `.gitignore` дополнен секциями secrets/env
  (`.env`, `.env.*`, `!.env.example`, `*.pem`, `*.key`, `*.local`) и личных входных запросов
  (`examples/test_queries.csv`; канон-сэмпл `examples/questions.csv` остаётся). Личные артефакты прогонов
  (`data/*.db`, `data/screenshots/`, `reports/*.pdf`, `dashboard/web/.env.local`) уже были игнорируемы и
  в git-историю НЕ попадали (проверено `git log --all`). `engines/README.md` — user-facing, оставлен
  под коммит. Удалён пустой `data/screenshots/6/` (артефакт боевого прогона). Триггер — запрос
  пользователя «оставить в репо только файлы для пользователя».
- 2026-06-21 — **Заложена мультидвижковость в бэклог + во все доки (ROADMAP Фича 3).** Зафиксирован
  план расширения захвата за пределы Google AI Overview на все популярные AI-интерфейсы с поиском
  (ChatGPT, Perplexity, Gemini, Claude, Yandex/Нейро, DeepSeek и др.). Рамка: пайплайн уже
  движко-агностичен (`engine` — открытая строка везде; захват = плейбук `engines/<engine>.md`),
  поэтому расширение в основном аддитивно — новый плейбук + per-engine решение по знаменателю
  (`overview_present` у «всегда-отвечающих» движков → grounded-answer гейт), маппинг источников/цитат
  per-engine. Стратегия: сначала рабочий пайплайн на Google, дальше движок за движком (приоритет
  Perplexity/ChatGPT). Добавлено: ROADMAP «Фича 3 — Multi-Engine Capture Expansion» (цель, стратегия,
  per-engine соображения, открытые решения, риски) + пункт 7 в §3 + интро «три фичи»; новый
  `engines/README.md` (паттерн «как добавить движок» + таблица статусов движков); forward-pointer в
  `INTERFACES.md` (§1 поле `engine` = точка расширения, §4 Scope-note про знаменатель); правки в
  `README.md`/`README.ru.md` (бэклог-нота «три фичи» + caveat + дерево), `SKILL.md` (движок как точка
  расширения + гайд при отсутствии плейбука), `dashboard/README.md` (движко-генеричные селекторы).
  **Только доки/спека — код и контракт НЕ менялись** (реализация отложена). Триггер — план
  пользователя на мультидвижковость.
- 2026-06-20 — **Готовность к установке как плагин + фиксация параллелизма.**
  (1) `claude plugin validate` нашёл блокер: в `.claude-plugin/marketplace.json` root-ключ
  `description` схема отвергает → перенесён в `metadata.description`; оба манифеста (plugin +
  marketplace) теперь валидируются чисто (`✔`). Установка: `claude plugin marketplace add <repo>`
  → `claude plugin install open-geo@open-geo-marketplace` (нужен коммит — install тянет git HEAD).
  Скилл лежит в `.claude/skills/open-geo/`, подключён через `plugin.json: "skills":
  "./.claude/skills/"` — валидный явный custom-путь (работает и как project-скилл локально, и
  как plugin-скилл при установке). (2) **Зафиксирован параллелизм как данность:** скилл создаёт
  **N = `--n-worker`** суб-агентов захвата и гоняет их **параллельно** (по чанку на воркера,
  каждый в своей вкладке/контексте); прежний serialize-каведат убран из `SKILL.md` и
  `README(.ru).md`, добавлен Gotcha-лок.
- 2026-06-20 — **Харденинг скилла `/open-geo` после первого боевого прогона (флот суб-агентов под супервизией).**
  По итогам реального прогона (бренд «Аскона», `askona.ru`, движок `google`) закрыты 5 проблем
  границы человек/тул/доки: (1) **расхождение `engine`** — `engines/google.md` хардкодил
  `engine="google_ai_overview"` против basename файла и live-БД; канонизирован **`google`**
  (= basename плейбука) во всех live-доках (`INTERFACES.md` §1/§3, `SKILL.md`, `engines/google.md`,
  `README.md`/`README.ru.md`, аннотация в `dashboard/README.md`, сломанный quickstart-пример в
  `scripts/setup.sh`); синтетический seed/fixture/test-слой намеренно оставлен на `google_ai_overview`.
  (2) **Скриншоты не персистятся** — `screenshot_path` всегда `null` (скрин транзиентный, только для
  чтения overview; `get_page_text` его роняет). (3) **Воркеры ограничены захватом+возвратом** — больше
  НЕ делают ingest/`--new-run`/запись в БД (это был корень левого пустого `run #2`) и НЕ ходят по
  сайтам-источникам (читают `href` на месте, закрывают залётные вкладки); валидируют read-only и
  **возвращают JSON оркестратору**. (4) **Центральный ingest у оркестратора** — SKILL STEP 4 переписан:
  скилл собирает все возвращённые объекты и заливает одним пакетом, затем финализирует. (5) **Сервер и
  деливераблы поднимает скилл, не воркер, и только после шагов 3–5.** Только доки/скилл/плейбук —
  **код пайплайна НЕ менялся** (git diff: 6 `.md` + `scripts/setup.sh`), 858 Python + 358 фронт-тестов
  не затронуты by construction. Порядок правок: authority-pass `INTERFACES.md` → остальные доки (README
  EN/RU — параллельные суб-агенты) → consistency-sweep по всему репо.
- 2026-06-19 — **Рефакторинг под восстановленную воронку + чистка кода (флот агентов под супервизией).**
  (1) КОД приведён к модели-воронке, к которой доки уже были развёрнуты: `relative_citation =
  n_cited/n_in_sources` восстановлена в `db.py` (колонка), `aggregate.py` (расчёт + STDOUT),
  `report/generate.py` (6-я KPI-карточка + конверсия в воронке), `dashboard/api.py` (выдача +
  read-time дельта) и фронтенде (6-я карточка + тултип); в `schema.py` добавлен валидатор
  `citations ⊆ sources`; `seed_demo`/`seed_fixture` дают воронко-валидные данные. (2) Фиксы из
  ревью: отчёт берёт baseline дельт только из `status='done'` (M1) и строго резолвит бренд по
  `(name, нормализованный домен)` (L8); API открывает SQLite read-only `mode=ro` (M10); фикстура
  дашборда пишет через единый `insert_capture` (M6); из `marketplace.json` убрано невалидное поле
  `skills` (M3); хардкод абсолютного пути в `SKILL.md` убран (H2); `/api/report` принимает `lang`,
  а экспорт PDF из дашборда идёт в языке/бренде/движке/периоде текущего UI (H4). (3) Из ВСЕГО кода
  удалены комментарии и докстринги (Python + фронтенд), оставлены только функц-директивы — см.
  Conventions. **Проверено:** 858 Python-тестов и 358 фронтенд-тестов зелёные, `npm run build`
  чистый, PDF (EN+RU) рендерится. Это закрывает пункт «код отстаёт от доков» из записи ниже.
- 2026-06-19 — Полное тестовое покрытие репозитория + CI-гейт. **Python** — pytest с
  branch-coverage, **858 тестов, 100%** по `pipeline`/`report`/`dashboard`. **Фронтенд** —
  Vitest + Testing-Library (jsdom), **358 тестов**, 99% stmt / 97% branch по `dashboard/web`.
  Инфраструктура: `pyproject.toml` (pytest + coverage), корневой `conftest.py` (изолированные
  фикстуры — временные SQLite-БД, FastAPI TestClient; `data/aeo.db` не трогается),
  `dashboard/web/vitest.config.ts` + `src/redesign/test/setup.ts` (полифиллы matchMedia/
  ResizeObserver). CI — `.github/workflows/ci.yml`: оба набора на каждый push/PR, таблица
  покрытия в job-summary + артефакты (`coverage.xml`/`lcov.info`), **жёсткий гейт 95%** на обе
  половины. Собрано флотом субагентов (супервизор + 20 Python + 12 фронтенд, writer→hardener).
  Минимальные правки кода (рефакторинг-freeze): `tests/test_pipeline.py`
  `.venv/bin/python`→`sys.executable` (для CI), `pytest-cov` в `requirements.txt`; 7 мелких
  warts (edge-case `normalize_domain`, непойманные `TypeError`/`AttributeError` в `i18n.t`, и
  др.) задокументированы тестами — продакшн-код НЕ менялся. **[✅ УЖЕ РЕШЕНО — см. верхнюю запись
  от 2026-06-19 о рефакторинге.]** (Историческая заметка: на момент написания код ещё отставал от
  доков — реализовывал старую модель без `relative_citation`. Это устранено отдельной фазой: код
  перенесён на воронку, `relative_citation` восстановлена, тесты синхронизированы и зелёные,
  inline-комментарии удалены. Ничего откатывать не нужно.)
- 2026-06-19 — **РАЗВОРОТ модели метрик обратно к воронке (исправление предыдущего неверного
  решения).** Подтверждено: **цитаты ⊆ источники** — модель цитирует только то, что извлекла
  в контекст; видимая панель источников Google — лишь **частичный** срез извлечённого набора,
  поэтому захват складывает процитированные ссылки в `sources`. Следовательно
  `n_cited ≤ n_in_sources ≤ n_overviews ≤ n_queries` — это валидная воронка. **`relative_citation`
  восстановлена** как конверсия «источник→цитата» (`n_cited/n_in_sources ∈ [0,1]`, больше = лучше).
  Прежний вывод живого теста («цитаты ⊄ источники / две независимые оси / воронки нет /
  relative_citation убрана») оказался **артефактом UI-панели** (вставные брендовые ссылки
  цитируются в прозе, но не всегда попадают в видимую панель — её ошибочно приняли за весь
  retrieval-набор). Теперь снова **шесть метрик**. Синхронно обновлены `INTERFACES.md` (§1 правило
  cited⊆sources, §2 строка `relative_citation` + миграция RE-ADD, §3.3 пример, §4 воронка +
  таблица из 6 метрик), `README.md`/`README.ru.md`, `engines/google.md`, `SKILL.md`, `dashboard/
  README.md`, `i18n/{en,ru}.json` (+ `i18n/README.md`). Только доки/спека/i18n; код — отдельной фазой.
- 2026-06-19 — Интернационализация под публичный релиз: расширяемый i18n-слой (`i18n/{en,ru}.json` +
  реестр `locales.json`; дашборд — переключатель EN/RU, дефолт EN, эндпоинты `/api/i18n`; отчёт —
  `--lang en|ru`). Всё user-facing/доки/примеры/seed/тесты переведены на английский; русские бренды
  убраны (демо — вымышленный `Acme`/`acme.com`). `README.md` (EN) + `README.ru.md`. Упаковка для
  установки из GitHub: `.gitignore`, `scripts/setup.sh`, `.claude-plugin/{plugin,marketplace}.json`
  (схема по офиц. докам Claude Code), `LICENSE`, `git init` (ветка `main`). Захват/контракт/метрики
  НЕ менялись. Добавить язык = положить `i18n/<code>.json`.
- 2026-06-19 — Дашборд: полный UI/UX-редизайн фронтенда (`dashboard/web/src/redesign/` —
  изолированная самодостаточная дизайн-система на CSS-переменных, без новых зависимостей):
  светлая+тёмная тема с переключателем, 5 KPI-карточек с (i)-подсказками (определения метрик
  по INTERFACES §4), recharts-график (двойная ось), семантичные таблицы по линзам/результатам.
  Сделан **единственным** фронтендом: `index.html` → `src/redesign/main.tsx`; старый UI
  (`App.tsx`/`components/*`/`main.tsx`/`index.css`/`api.ts`/`format.ts`) удалён за ненадобностью,
  свой data-слой бьёт в те же `/api/*`. Собран
  группой агентов (3 build + 1 review). Ранее в той же сессии — UX/a11y-фиксы старого UI:
  фокус-ринги, тач-таргеты ≥44px, `role="alert"`, `prefers-reduced-motion`.
- 2026-06-19 — Введена конвенция «док-дисциплина» (раздел Conventions): любая значимая
  архитектурная/модельная правка синхронно отражается во ВСЕХ продуктовых доках, не только в
  коде, — чтобы следующие сессии не галлюцинировали между кодом и инструкциями.
- 2026-06-19 — ⚠️ **ОТМЕНЕНО более поздней записью выше (разворот к воронке) — оставлено как
  история, НЕ актуально.** Пересмотрена модель метрик: **убрана относительная цитируемость**
  (воронка `n_cited/n_in_sources`); **добавлены видимость в цитировании** (`n_cited/n_overviews`)
  **и средняя позиция в цитировании**. Теперь две симметричные оси источники/цитаты ×
  {видимость, средняя позиция} + покрытие + тональность, воронки нет. Триггер — живой тест
  Google AI Overview, показавший, что цитаты ⊄ источники (вставные брендовые ссылки в прозе
  цитируются, но не попадают в панель источников). Авторитет — `pipeline/INTERFACES.md` §4.
- 2026-06-19 — Построена основная команда — трекер видимости (visibility tracker) —
  сквозняком, clean-room с нуля: пайплайн `pipeline.*` (контракт `QueryCapture` на Pydantic
  v2 + SQLite WAL `db.py`), `ingest`/`aggregate`/`seed_demo`, тесты зелёные
  (`tests/test_pipeline.py` — схема, ingest, математика метрик); плейбук захвата Google AI
  Overview (`engines/google.md`, Claude-in-Chrome); skill-оркестратор `/open-geo`; PDF-отчёт
  `report.generate` (ReportLab+matplotlib, тёмный русский); дашборд `dashboard/` (FastAPI +
  React/Vite/Tailwind/Recharts). Добавлены `README.md` и `requirements.txt`. Стек основной
  команды зафиксирован (см. Stack/Architecture); ROADMAP-фичи остаются в бэклоге.
- 2026-06-18 — Заведён бэклог двух фич (question-harvesting pipeline, GEO-audit gate)
  в ROADMAP.md. Зафиксировано как тех-долг. **Все решения отложены («все потом»)** —
  сводный список открытых вопросов в ROADMAP §3; реализация не начата.
