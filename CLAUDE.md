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
  - Отчёт — **ReportLab + matplotlib** (тёмный PDF, без headless-Chrome/системных либ; i18n — `--lang en|ru`).
  - Дашборд — **FastAPI** (read-only API) + **React/Vite/TypeScript/Tailwind/Recharts** (i18n: переключатель EN/RU, дефолт EN).
  - i18n — расширяемый слой `i18n/{en,ru}.json` (англ. канон) + реестр `i18n/locales.json`; добавить язык = положить `i18n/<code>.json`.
  - Зависимости: `pydantic>=2,<3`, `reportlab`, `matplotlib`, `fastapi`, `uvicorn`, `pytest`, `httpx`.
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
   лучше, ∈ `[0,1]`); плюс качественная (текстовая) тональность; по срезам; дельты к
   предыдущему прогону на чтении. Намеренно **нет** конкурентов, **нет** сводного индекса,
   **нет** share-of-voice. Авторитет — `pipeline/INTERFACES.md` §4.
6. **Вывод** — `report.generate` (тёмный PDF, ReportLab+matplotlib, i18n `--lang`) и/или
   `dashboard/` (FastAPI + React/Vite/Tailwind/Recharts, переключатель EN/RU), плюс резюме.

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
  деливераблы (PDF + сервер дашборда) — у скилла (SKILL STEP 4/6); сервер поднимается только
  после того как ВСЕ захваты собраны. НЕ давать воркерам `--new-run`/`--run-id`/запуск сервера
  и НЕ велеть им ходить по сайтам-источникам (читать `href` на месте, закрывать залётные
  вкладки) — иначе как в первом боевом прогоне родится левый пустой `run` и лишние переходы.
- **`engine` движка Google = `google`** (= basename `engines/google.md`), НЕ `google_ai_overview`.
  Live-доки и live-БД на `google`; **синтетический seed/fixture/test-слой намеренно оставлен на
  `google_ai_overview`** (менять = churn 858 тестов). Поэтому curl-проба фикстуры в
  `dashboard/README.md` использует `google_ai_overview` (аннотировано) — НЕ «чинить» её на
  `google`. `screenshot_path` всегда `null` (скрин транзиентный, только для чтения overview).
- **`--n-worker` = реальная параллельность (данность дизайна).** Скилл поднимает **N =
  `--n-worker`** суб-агентов захвата и гоняет их **параллельно** (по чанку запросов на
  воркера, каждый в своей вкладке/контексте браузера). НЕ откатывать к «один браузер /
  serialize / best-effort» — параллельность поддерживается и является дизайном.

## Recent Changes
Running-log решений вынесен в отдельный файл — [RECENT_CHANGES.md](RECENT_CHANGES.md)
(newest-on-top, `YYYY-MM-DD — что/почему`). Сюда лог больше не пишем: любая значимая
архитектурная/модельная правка добавляет строку в `RECENT_CHANGES.md` (см. док-дисциплину в
разделе Conventions).

## Planned / Tech Debt
См. [ROADMAP.md](ROADMAP.md) — детальные спеки всех трёх фич (question-harvesting,
GEO-audit gate, мультидвижковость), расширенный чек-лист GEO-аудита, открытые решения и риски.
