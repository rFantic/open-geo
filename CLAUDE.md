# CLAUDE.md — open-geo

## Overview
open-geo — инструмент для **GEO (Generative Engine Optimization)**: помогает брендам
становиться видимыми и цитируемыми в ответах нейросетей (ChatGPT, Claude, Gemini,
Perplexity, Яндекс с Алисой, DeepSeek и др. популярных AI-интерфейсах с поиском). Это
production-решение; данный репозиторий — рабочая директория для следующих итераций.
**Пока реализован захват Google AI Overview; остальные движки — ROADMAP Фича 3
(мультидвижковость).**

## Stack
- Язык: Python (3.11), Pydantic v2, async-first.
- **Стек основной команды РЕШЁН и реализован** (см. «Architecture → Implemented»):
  - Пайплайн на Python + **Pydantic v2** (контракт `QueryCapture`).
  - Захват ответов — **Claude-in-Chrome** + per-engine плейбуки (`engines/<engine>.md`),
    НЕ headless: видимый залогиненный Chrome.
  - Хранилище — **SQLite в WAL-режиме** (`data/aeo.db`), JSON-массивы в `*_json` колонках.
  - Отчёт — **ReportLab + matplotlib** (тёмный PDF, без headless-Chrome/системных либ; i18n — `--lang en|ru|zh|ar`; шрифты для не-латиницы бандлятся в `fonts/` — Noto Sans SC (zh) + Noto Naskh Arabic (ar, reshape/bidi/RTL), DejaVu (en/ru); выбор по `--lang`).
  - Дашборд — **FastAPI** (read-only API) + **React/Vite/TypeScript/Tailwind/Recharts** (i18n: переключатель языка en/ru/zh/ar, дефолт en).
  - i18n — расширяемый слой `i18n/{en,ru,zh,ar}.json` (англ. канон) + реестр `i18n/locales.json`; добавить язык = положить `i18n/<code>.json`.
  - Зависимости: `pydantic>=2,<3`, `reportlab`, `matplotlib`, `arabic-reshaper`, `python-bidi`, `fastapi`, `uvicorn`, `pytest`, `httpx`. (`fonttools` — только для `fonts/build.py`, не рантайм.)
- LLM-шаги из ROADMAP (переписывание вопросов и т.п.) — стек по-прежнему НЕ выбран,
  решается ПЕРЕД реализацией (ASK-FIRST, см. ROADMAP §3).
- HTTP/parse-слой аудита (не-LLM, ROADMAP Фича 2): `httpx` + `selectolax`/`lxml` + `extruct` (JSON-LD) — кандидаты.

## Architecture

### Implemented — main command (visibility tracker)
Сквозной трекер видимости бренда в AI-ответах вокруг команды **`/open-geo`**. Поток:

1. **Команда** `/open-geo <questions.csv> <engine> <domain> --brand … --n-worker N
   [--output dashboard|pdf|both] [--period today|all]` — оркестратор
   (`.claude/skills/open-geo/SKILL.md`). Создаёт прогон, раздаёт чанки запросов воркерам.
   При нехватке аргументов — интерактивный визард (STEP A: интро + структурный опросник), при полном
   наборе пропускается (fast-path). Команда **user-only** (`disable-model-invocation`).
   Шаг 0 (pre-gate под Фичу 2) — пока **no-op**-заглушка.
2. **Capture playbook** — per-engine инструкции `engines/<engine>.md` (первый — Google AI
   Overview, `engines/google.md`), которые исполняет **Claude-in-Chrome** в видимом
   залогиненном Chrome. Один `(query, lens)` → один объект **`QueryCapture`**. Воркеры захвата —
   движко-агностичный сабагент `capture-worker` (`.claude/agents/capture-worker.md`); `engines/<engine>.md`
   инжектится воркеру как авторитет по движку.
3. **Контракт** `QueryCapture` (Pydantic v2) — `pipeline/schema.py`; **авторитетная спека —
   `pipeline/INTERFACES.md`** (поля §1, БД §2, CLI §3, формулы §4).
4. **ingest / aggregate** — `pipeline.ingest` валидирует пакет и пишет в SQLite (невалидные
   строки не роняют пакет — возвращаются в `errors`); `pipeline.aggregate` считает метрики
   по срезам + строку `all`. Демо-данные — `pipeline.seed_demo`. БД — `data/aeo.db`
   (SQLite WAL), мультибренд, тайм-серия по прогонам.
5. **Метрики** (знаменатель видимости = overview-present запросы) — **воронка**
   `n_cited ≤ n_in_sources ≤ n_overviews ≤ n_queries` (цитаты ⊆ источники: модель цитирует
   только то, что извлекла; захват сворачивает цитаты-ссылки в `sources`, т.к. видимая панель
   источников — лишь частичный срез извлечённого набора). **Шесть метрик**: покрытие AI
   Overview (`n_overviews/n_queries`); видимость в источниках (`n_in_sources/n_overviews`);
   видимость в цитатах (`n_cited/n_overviews`); средняя позиция в источниках и средняя позиция
   в цитатах (среднее лучшего `min`-ранга по запросам, где домен попал в источники /
   процитирован; меньше = лучше); **относительная цитируемость** `relative_citation`
   (`n_cited/n_in_sources` — конверсия «источник→цитата», последний шаг воронки; больше =
   лучше, ∈ `[0,1]`); плюс качественная (текстовая) тональность — пер-запросная `sentiment`, а также
   **пер-срезовая качественная сводка** (`lens_sentiment`): одна короткая фраза на срез (general/branded/
   comparative) + синтез `all`, которую на финализе пишет скилл (SKILL STEP 5b) через
   `pipeline.lens_sentiment` (НЕ `aggregate`, тот остаётся детерминированной математикой); по срезам; дельты
   к предыдущему прогону на чтении. Намеренно **нет** конкурентов, **нет** сводного индекса, **нет**
   share-of-voice, **нет** числовой тональности (сводка остаётся текстом). Авторитет — `pipeline/INTERFACES.md` §4.
6. **Вывод** — `report.generate` (тёмный PDF, ReportLab+matplotlib, i18n `--lang`) и/или
   `dashboard/` (FastAPI + React/Vite/Tailwind/Recharts, переключатель языка en/ru/zh/ar), плюс резюме.
   Пер-срезовая сводка тональности из `lens_sentiment` показывается как полоса карточек «Sentiment
   by lens» над таблицей результатов (дашборд) и как вводная строка секции тональности (PDF); это
   **данные**, поэтому она следует языку захваченных `sentiment`, а не `--lang`.

### Planned — backlog (НЕ реализовано)
Три пункта в бэклоге — детали в [ROADMAP.md](ROADMAP.md). Question Harvesting и GEO-Audit Gate
— отдельные подсистемы рядом с основной командой; Multi-Engine — расширение самой команды:
- **Question Harvesting Pipeline** — сбор SEO-вопросов (Wordstat + др. источники) →
  переписывание в естественные запросы пользователей к LLM. Источники данных —
  pluggable-провайдеры (чтобы работало на любом рынке).
- **Domain GEO-Audit Gate** — быстрый аудит домена на готовность к GEO (crawl-доступ,
  robots.txt для AI-ботов, sitemap, structured data, llms.txt …). Запускается ПЕРВЫМ как
  gate перед основной командой; при провале отдаёт remediation-отчёт «что добавить».
- **Multi-Engine Capture Expansion** (Фича 3) — захват не только Google AI Overview, а всех
  популярных AI-движков с поиском (ChatGPT, Perplexity, Gemini, Claude, Yandex/Нейро,
  DeepSeek, …). Архитектура уже движко-агностична (`engine` — открытая строка везде; захват =
  плейбук `engines/<engine>.md`), поэтому расширение в основном аддитивно: новый плейбук +
  per-engine решение по знаменателю метрик. Паттерн — `engines/README.md`, спека — ROADMAP Фича 3.

## Conventions
- **Док-дисциплина — код и доки НИКОГДА не расходятся (анти-галлюцинации).** Любая значимая
  архитектурная/модельная правка (контракт `QueryCapture`, метрики, схема БД, способ захвата,
  CLI, поведение команды) ОБЯЗАНА в том же заходе отразиться во ВСЕХ продуктовых доках, а не
  только в коде. Авторитет — `pipeline/INTERFACES.md`; под него приводятся `CLAUDE.md`,
  `README.md`, `.claude/skills/open-geo/SKILL.md`, `dashboard/README.md`, `engines/*.md`.
  Порядок: сначала `INTERFACES.md`, затем остальные доки, потом/параллельно код, и строка в
  [RECENT_CHANGES.md](RECENT_CHANGES.md) (дата + что/почему). «Готово» для любой правки поведения = код ✅ + тесты ✅ +
  **доки синхронизированы** ✅. Следующая сессия не должна угадывать между кодом и инструкциями.
- **Код БЕЗ комментариев и докстрингов — источник истины это `.md`-доки, не код.** Весь
  прозаический текст-в-коде (`#`, `//`, `/* */`, `"""docstrings"""`, JSDoc) удалён и НЕ
  добавляется снова: знание живёт в `pipeline/INTERFACES.md` и прочих доках (чтобы агенты не
  путались между доками/комментариями/кодом и не тащили устаревшую прозу). Исключение —
  **функциональные директивы** (это не проза, а машинные инструкции): `# noqa`, `# type: ignore`,
  `# pragma: no cover`, shebang, `/// <reference>`, `// @ts-expect-error`, `eslint-disable`. Имена и
  структура должны быть самодокументирующими; любые пояснения — в `.md`-доках.
- Код/идентификаторы — English. Репозиторий **международный**: UI/отчёты/доки/примеры — **English по
  умолчанию** (демо-бренд — вымышленный `Acme`/`acme.com`), плюс `README.ru.md` для рус. комьюнити;
  внутренние `CLAUDE.md`/`ROADMAP.md` ведём по-русски.
- **i18n — добавить язык = положить файл.** UI-строки дашборда и отчёта живут в `i18n/<code>.json`
  (англ. — канон), реестр `i18n/locales.json`; новый язык появляется в переключателе дашборда и в
  `report --lang` без правок кода (пропуск ключа → fallback на en). Переводим только UI; данные
  (запросы/тональность/домены) — нет. Язык UI ≠ рынок захвата (`hl`/`gl` у движка).
- Pydantic v2, async-first, **native structured outputs** (без regex-парсинга JSON из прозы).
- Любой код, вызывающий LLM / строящий агентов: СНАЧАЛА выбрать стек (ASK FIRST),
  затем skill `llm-agents`. Bare-SDK — только для одиночных не-агентных вызовов.

## Gotchas
- **Цитаты ⊆ источники — это воронка, не «две независимые оси».** Модель может процитировать
  только то, что извлекла в контекст; видимая панель источников Google — лишь **частичный**
  срез этого набора, поэтому захват ОБЯЗАН складывать любой процитированный домен и в
  `sources` (см. `engines/google.md`, INTERFACES §1). Отсюда `n_cited ≤ n_in_sources ≤
  n_overviews ≤ n_queries` и валидная `relative_citation = n_cited/n_in_sources ∈ [0,1]`. НЕ
  откатывать к «цитаты ⊄ источники / воронки нет / relative_citation убрана» — это был
  артефакт UI-панели (см. `RECENT_CHANGES.md`, 2026-06-19).
- **Пер-срезовая сводка тональности пишется ОРКЕСТРАТОРОМ, не `aggregate`, и живёт в отдельной
  таблице `lens_sentiment`.** `pipeline.aggregate` остаётся детерминированной математикой и на
  ре-агрегации `DELETE`+пересобирает `metrics` — поэтому качественный синтез (LLM-проза скилла,
  SKILL STEP 5b → `pipeline.lens_sentiment`) намеренно НЕ в `metrics`, иначе ре-агрегация затирала
  бы текст. Read-only API дашборда `init_db` не вызывает, поэтому на старой БД без `lens_sentiment`
  он ОБЯЗАН отдавать «нет сводок» (ловить `no such table`), а не падать. Сводка остаётся **текстом**
  (без числового индекса) и следует языку данных, не `--lang`. Авторитет — `INTERFACES.md` §2/§3.4/§4.
- `llms.txt` (НЕ `llm.txt`!) — community-конвенция, ~10–15% adoption, НЕ доказанный
  ranking-фактор. Добавлять как гигиену, не переоценивать.
- Wordstat API — нужен OAuth + ClientId + одобрение поддержки Yandex Direct + квоты
  (503 при превышении). Большой lead time → заявку подавать заранее. Скрейпинг — против ToS.
- Реальные «блокеры» GEO — недоступность для краула (robots.txt режет AI-ботов; контент
  только в client-side JS), а НЕ отсутствие llms.txt. Сайт может уже цитироваться через
  сторонние источники — поэтому gate по умолчанию **advisory**, хардблок только на блокерах.
- **Архитектура уже движко-агностична — но «добавить движок» ≠ только новый промпт.** `engine`
  — открытая snake_case-строка везде (контракт/БД/CLI/дашборд/отчёт), захват = плейбук
  `engines/<engine>.md`, поэтому плумбинг расширяется аддитивно. НО семантика знаменателя
  (`overview_present`) задана под Google (обзор может не отрендериться); у «всегда-отвечающих»
  движков (ChatGPT/Claude/Gemini/Perplexity/DeepSeek) её надо переопределить (grounded-answer
  гейт), а UI источников/цитат — маппить per-engine. Не считать, что Google-гейт переносится
  дословно. См. ROADMAP Фича 3 + `engines/README.md`.
- **Воркеры захвата НЕ пишут в БД и НЕ поднимают серверы (граница воркер/оркестратор).**
  Воркер только водит браузер, собирает `QueryCapture`, валидирует его read-only через
  `pipeline.schema` и **возвращает JSON оркестратору**. Весь ingest/finalize/aggregate и
  деливераблы (PDF + сервер дашборда) — у скилла (SKILL STEP 4/6); **ingest идёт
  инкрементально — чанк за чанком, как воркеры возвращаются** (durability), а сервер
  дашборда поднимается только после того как ВСЕ захваты собраны. НЕ давать воркерам
  `--new-run`/`--run-id`/запуск сервера и НЕ велеть им ходить по сайтам-источникам (читать
  `href` на месте, закрывать залётные вкладки) — иначе как в первом боевом прогоне родится
  левый пустой `run` и лишние переходы.
- **Захват durable инкрементально + resume прерванного прогона (НЕ ingest одним батчем в
  конце).** `(run_id, query, lens)` — уникальный ключ результата (UNIQUE-индекс +
  `INSERT … ON CONFLICT DO NOTHING`), поэтому повтор/overlap/resume **идемпотентны** (без
  дублей и без раздувания метрик). Оркестратор ingest-ит чанк каждого воркера сразу как тот
  вернулся, поэтому крах в середине не теряет уже захваченное. Прерванный прогон остаётся
  `status='running'`; на повторе скилл находит его (`find_unfinished_run`), читает уже
  захваченные ключи (`get_captured_keys`) и до-захватывает **только недостающие**
  `(query,lens)` в тот же run. `status='done'` ставит **только скилл** (SKILL STEP 4.2) —
  `ingest` его не трогает. Авторитет — `INTERFACES.md` §2.1/§3.2. НЕ откатывать к «ingest
  одним батчем в конце» / «`ingest` ставит `status='done'`» / «дубли `(run_id,query,lens)`
  разрешены».
- **`engine` движка Google = `google`** (= basename `engines/google.md`), НЕ `google_ai_overview`,
  **везде**: live-доки, live-БД И синтетический seed/fixture/test-слой — все на `google`. Авторитет —
  `INTERFACES.md` §1.1 (`engine` = basename плейбука). Раньше синтетический слой намеренно сидел на
  `google_ai_overview` как изолированное исключение — **выровнено на `google` 2026-06-22** (демо/фикстура
  показывали не тот id, что live; см. `RECENT_CHANGES.md`); исключения больше нет. `screenshot_path`
  всегда `null` (скрин транзиентный, только для чтения overview).
- **`--n-worker` = реальная параллельность (данность дизайна).** Скилл поднимает **N =
  `--n-worker`** суб-агентов захвата и гоняет их **параллельно** (по чанку запросов на
  воркера, каждый в своей вкладке/контексте браузера). НЕ откатывать к «один браузер /
  serialize / best-effort» — параллельность поддерживается и является дизайном.
- **PDF рендерит не-латиницу из бандла `fonts/`; шрифт выбирается ПЕР-ЯЗЫЧНО, т.к. ReportLab НЕ
  делает пер-глифовый fallback.** `report.generate.register_fonts(lang)` подменяет модульные
  глобалы `FONT/FONT_BOLD/FONT_OBLIQUE` (zh → `NotoSansSC`, ar → `NotoNaskhArabic`, en/ru →
  `DejaVuSans`) и matplotlib `font.family` (fallback-стек `[<язык>, DejaVu Sans]`); поэтому НЕ
  хардкодить имена шрифтов в рендере — читать активные глобалы. **Arabic — RTL**: текст
  пред-шейпится (`report/textshape.py`: `arabic_reshaper`→`python-bidi`) ПЕРЕД отрисовкой и в
  ReportLab (обёртка над `canvas.draw*`), и в matplotlib-метках; абзацы право-выравниваются
  (`Doc.rtl`). en/ru остаются байт-стабильными (та же DejaVu, shape = no-op). Шрифты
  **субсетятся** (`fonts/build.py`): zh = GB2312 (~6.7k иероглифов, обычный китайский, не только
  chrome — данные следуют языку захвата), ar = полное покрытие; три глифа-стрелки дельт `▲▼▬`
  **синтезируются** при сборке (их нет в сабсетах Noto). Перегенерация только через
  `python fonts/build.py` (см. `fonts/README.md`); `.ttf` руками НЕ править. Кэш апстрим-VF —
  `fonts/.cache/` (git-ignored). Лицензии — OFL 1.1 (`fonts/OFL-*.txt`).

## Recent Changes
Running-log решений вынесен в отдельный файл — [RECENT_CHANGES.md](RECENT_CHANGES.md)
(newest-on-top, `YYYY-MM-DD — что/почему`). Сюда лог больше не пишем: любая значимая
архитектурная/модельная правка добавляет строку в `RECENT_CHANGES.md` (см. док-дисциплину в
разделе Conventions).

## Planned / Tech Debt
См. [ROADMAP.md](ROADMAP.md) — детальные спеки всех трёх фич (question-harvesting,
GEO-audit gate, мультидвижковость), расширенный чек-лист GEO-аудита, открытые решения и риски.
