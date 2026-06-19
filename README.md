[English](README.md) · [Русский](README.ru.md)

# open-geo

**open-geo** is a **GEO (Generative Engine Optimization)** tool: it measures **how visible
your brand is inside AI answers**. Search is shifting from "ten blue links" to a generated
answer — Google's AI Overview, and the other assistants people now ask first. That answer
leans on a small set of sources. The question open-geo answers is: **does your domain make
it into those answers — into the sources, into the citations, into the text — and how is the
brand spoken about when it does.**

Unlike classic SEO (where a link ranks in a list), here the answer is *generated*, the
sources are few, and being one of them **is** "visibility in AI." If your domain isn't
cited, you are invisible.

## What you get

- **Daily-ish, manual capture of Google AI Overview** — a list of queries is run through one
  engine in a real, logged-in browser, and how the target domain shows up is recorded.
- **Six metrics + qualitative sentiment** — a visibility funnel (overview → sources →
  citations): coverage, a visibility rate and an average best position for sources *and* for
  citations, plus the source→citation conversion (`relative_citation`) and a short free-text
  note on how each answer treats the brand (see [Metrics](#metrics)).
- **SQLite multi-brand time-series** — every run is stored in `data/aeo.db` (SQLite, WAL),
  so you accumulate history per brand + engine and get run-over-run deltas.
- **A dashboard with an EN/RU language switcher** (extensible to more languages) — FastAPI
  read-only API + a Vite/React frontend with light/dark themes and per-metric tooltips.
- **A PDF report** (`--lang en|ru`) — a self-contained themed A4 report (ReportLab +
  matplotlib), no headless Chrome and no system libraries required.

> Two further features live in the backlog and are **not implemented** (SEO-question
> harvesting → natural LLM prompts; a domain GEO-audit gate). Specs are in
> [ROADMAP.md](ROADMAP.md).

## How it works

The whole tracker is orchestrated by the **`/open-geo`** command:

1. **Capture playbook** — a per-engine playbook (`engines/<engine>.md`; the first is
   `engines/google.md` for Google AI Overview) is driven by **Claude-in-Chrome** in a
   **visible, logged-in** Chrome. It reads the rendered AI Overview as an LLM does, expands
   the sources panel and the inline citation chips, normalizes domains, and emits **one
   `QueryCapture` object per query**.
2. **`QueryCapture`** — the validated capture contract (Pydantic v2; authoritative spec in
   [`pipeline/INTERFACES.md`](pipeline/INTERFACES.md)).
3. **ingest / aggregate** — captures are validated and written to SQLite
   (`pipeline.ingest`), then metrics are computed per lens plus an `all` row
   (`pipeline.aggregate`).
4. **dashboard / PDF** — the deliverable(s) are produced from the stored metrics, plus a
   short summary.

## Metrics

The **denominator for visibility is overview-present queries** (`overview_present`): you can
only be visible where an overview actually rendered. Metrics are computed **per lens**
(`general` / `branded` / `comparative`) plus an aggregate `all` row.

The model is a **funnel**: of all queries, some render an overview; of those, in some the
domain is retrieved into `sources`; of those, in some it is actually cited in the answer.
Because the model can only cite what it retrieved, **citations are a subset of sources**
(capture folds any inline-cited link into `sources` — the visible Google sources panel is
only a partial view of the retrieval set), so the counts nest:
`n_cited ≤ n_in_sources ≤ n_overviews ≤ n_queries`.

- **`overview_coverage`** — share of queries for which an overview rendered at all
  (`n_overviews / n_queries`).
- **`visibility_in_sources`** — of overview queries, the share where the target domain made
  it into `sources`, the relied-on set (`n_in_sources / n_overviews`).
- **`visibility_in_citations`** — of overview queries, the share where the domain is cited in
  the answer (`n_cited / n_overviews`).
- **`avg_source_position`** — average best (`min`) rank of the domain among sources, over the
  queries where it appears (**lower is better**; `—` if it never appears).
- **`avg_citation_position`** — average best (`min`) rank of the domain among citations, over
  the queries where it is cited (**lower is better**; `—` if it is never cited).
- **`relative_citation`** — the **source→citation conversion**: of the queries where you were
  retrieved into `sources`, the share where the model actually cited you
  (`n_cited / n_in_sources`, the last step of the funnel; **higher is better**, bounded to
  `[0, 1]` because citations ⊆ sources).
- **sentiment** — a short **qualitative** phrase per query describing how the answer treats
  the brand. It is **free text, not a number**; it is never aggregated into a metric — the
  report and dashboard show it as-is.

There is intentionally **no competitors, no share-of-voice, and no composite index.**
**Deltas** between runs are computed at read-time (by the report/dashboard) against the
previous completed run of the same brand + engine; they are not stored
(`pipeline/INTERFACES.md` §4.1).

## Prerequisites

- **Python 3.11** — pipeline, report, and the dashboard backend (a `.venv` from
  `requirements.txt`).
- **Node.js 20+** — only for the dashboard frontend (Vite + React + TypeScript + Tailwind +
  Recharts).
- **Claude-in-Chrome** extension/MCP connected **and a logged-in browser** — capture is
  **visible and manual**, driven through a logged-in Chrome session (not headless). AI
  Overview depends on who is logged in and on the locale, so the session is left as-is (no
  incognito, no logout).

## Install

The robust path (the repo ships `scripts/setup.sh`, which creates the venv, installs the
Python deps, and runs `npm install` for the frontend):

```bash
git clone <repo> open-geo
cd open-geo
bash scripts/setup.sh
```

Then connect the **Claude-in-Chrome** extension and make sure Chrome is **logged in** to the
Google account whose market you want to track — capture runs in that visible browser.

> **Alternative — install as a Claude Code plugin.** This repo also ships a plugin manifest
> under `.claude-plugin/`, so you can add it via `/plugin` and get the `/open-geo` skill
> without cloning manually. The same browser prerequisite applies.

### Install & use in another Claude chat

A common way to use open-geo is to hand it to Claude in a fresh chat. Tell Claude something
like:

> Clone `<repo>`, run `bash scripts/setup.sh`, then use the `/open-geo` skill to track my
> domain `acme.com` (brand "Acme") against `examples/questions.csv` on `google_ai_overview`.

Claude clones the repo, runs the setup script, and the `/open-geo` skill becomes available as
the operator entry point. Make sure the Claude-in-Chrome extension is connected and the
browser is logged in first — that is the one thing Claude cannot do for you.

## Usage

### The `/open-geo` command (operator entry point)

```
/open-geo <questions.csv> <engine> <domain> --brand "Acme" --n-worker <N> \
          [--output dashboard|pdf|both] [--period today|all] [--lang en|ru]
```

| argument | meaning |
|---|---|
| `<questions.csv>` | CSV with columns **`query,lens`**, where `lens ∈ general \| branded \| comparative`. Ready sample: `examples/questions.csv`. |
| `<engine>` | engine id, snake_case, e.g. `google_ai_overview`. Written into every `QueryCapture` and selects the capture playbook `engines/<engine>.md`. |
| `<domain>` | the target domain (any spelling: `https://www.acme.com`, `acme.com` — normalized automatically). |
| `--brand "<name>"` | human brand name (used in report/dashboard titles and the summary). |
| `--n-worker <N>` | number of capture workers. **Keep modest (1–3)** — see the caveat below. |
| `--output` | `dashboard` (default) \| `pdf` \| `both`. |
| `--period` | `all` (default — full brand+engine history, enables deltas) \| `today` (this run only). |
| `--lang` | `en` (default) \| `ru` — UI language for the deliverables: the PDF report language and the dashboard's default language. |

Step by step the command: creates a run → splits the queries across workers, each of which
drives the engine via the playbook and sends a batch of `QueryCapture` objects to
`pipeline.ingest` → finalizes the run → computes metrics (`pipeline.aggregate`) → produces the
dashboard and/or PDF → prints a short summary from the `lens="all"` row. Details in
[`.claude/skills/open-geo/SKILL.md`](.claude/skills/open-geo/SKILL.md).

> **Step 0 (pre-gate) is a no-op.** The command reserves a slot for a future domain
> GEO-audit gate (ROADMAP Feature 2). In v1 nothing is called and the run is never blocked.

### Demo data

A synthetic multi-run dataset (handy to see the report and dashboard without a real capture):

```bash
.venv/bin/python -m pipeline.seed_demo --reset
```

`--reset` deletes `data/aeo.db` (and its `-wal`/`-shm`) before seeding. It creates several
runs on different dates, each with all the edge cases (no overview; domain absent; domain at
multiple positions; a zero-visibility lens to exercise the guards).

### PDF report

```bash
.venv/bin/python -m report.generate \
  --brand "Acme" --domain acme.com --engine google_ai_overview \
  --period all --lang en --out reports/acme.pdf
```

A self-contained themed A4 PDF (ReportLab + matplotlib, no headless Chrome / no system
libraries): a cover, KPI cards with deltas vs the previous run, the lens breakdown,
the visibility funnel (sources / citations), a per-run trend when `--period all`,
and a qualitative-sentiment block (representative phrasings as-is). `--lang en|ru` sets the
report language (default `en`). `--period today` is the latest run; `--period all` adds the
time-series.

### Dashboard

The backend (FastAPI, read-only over `data/aeo.db`) and the frontend (Vite dev server) run as
two processes **from the repo root**:

```bash
# 1) API (read-only). Pick a free port — 8000 is often busy on this machine:
OPEN_GEO_DB=data/aeo.db .venv/bin/python -m uvicorn dashboard.api:app \
    --host 127.0.0.1 --port 8077

# 2) Frontend (separate terminal):
cd dashboard/web && npm run dev      # http://localhost:5173
```

- The DB path comes from the **`OPEN_GEO_DB`** env var (default `data/aeo.db`).
- **Local port 8000 is often already taken** — pick another (e.g. `8077`) and point the
  frontend at it with `VITE_API_BASE=http://127.0.0.1:8077 npm run dev` (the API serves
  permissive CORS, so a cross-origin base works without the proxy).
- The dashboard shows metrics per brand/engine: KPI cards with read-time deltas, the lens
  breakdown, a retrospective chart, a per-query table, and a PDF export. It has light/dark
  themes and an **EN/RU language switcher** (and per-metric `(i)` tooltips). Endpoints and
  details: [`dashboard/README.md`](dashboard/README.md).

## Languages / i18n

The interface (dashboard + PDF report) is fully **internationalized and extensible** — all
user-facing strings live in `i18n/` (English is the canonical locale). **To add a language:**

1. Copy `i18n/en.json` → `i18n/<code>.json` (e.g. `i18n/de.json`) and translate the values,
   keeping every key and every `{placeholder}` verbatim.
2. Add it to `i18n/locales.json`: `{ "code": "<code>", "name": "<native display name>" }`.
3. Done — it appears in the dashboard switcher automatically and works via
   `report --lang <code>`. Missing keys fall back to English per key, so a partial
   translation never breaks the UI.

See [`i18n/README.md`](i18n/README.md) for the full model. (Note: only UI chrome is
translated — captured data such as query text, sentiment, domains, and brand names is shown
as-is. UI language is independent of the capture market.)

## Project structure

```
open-geo/
├── pipeline/                # Python core (Pydantic v2 + SQLite WAL)
│   ├── schema.py            #   QueryCapture / Link contract + normalize_domain
│   ├── db.py                #   SQLite (WAL) layer: brands/runs/results/metrics
│   ├── ingest.py            #   CLI: create a run / ingest & validate a batch
│   ├── aggregate.py         #   CLI: compute metrics per lens + "all"
│   ├── seed_demo.py         #   CLI: synthetic demo data
│   └── INTERFACES.md        #   authoritative contract (fields, DB, formulas)
├── engines/
│   └── google.md            # Google AI Overview capture playbook (Claude-in-Chrome)
├── report/
│   ├── generate.py          # themed PDF (ReportLab + matplotlib), --lang en|ru
│   ├── i18n.py              #   loads i18n/<lang>.json merged over en.json
│   └── _selftest_fixture.py #   throwaway DB for the report self-test
├── dashboard/
│   ├── api.py               # FastAPI, read-only over data/aeo.db (+ /api/i18n)
│   ├── seed_fixture.py      #   seeds a throwaway fixture DB for dashboard self-test
│   ├── web/                 # Vite + React + TS + Tailwind + Recharts (+ Vitest tests)
│   └── README.md            # run commands, endpoints, EN/RU switcher
├── i18n/                    # UI strings: en.json (canonical), ru.json, locales.json
├── .claude/skills/open-geo/
│   └── SKILL.md             # the /open-geo command orchestrator
├── examples/questions.csv   # sample input CSV (query,lens)
├── tests/                   # pytest suite (858 tests) — schema, db, ingest,
│                            #   aggregate, seed, report, dashboard API, fixtures
├── conftest.py              # shared pytest fixtures (throwaway DBs, API client)
├── pyproject.toml           # pytest + coverage.py (branch) config
├── .github/workflows/ci.yml # CI: pytest + vitest with a strict 95% coverage gate
├── data/aeo.db              # working DB (SQLite, WAL) — created by the pipeline
├── scripts/setup.sh         # venv + Python deps + npm install
├── requirements.txt
├── ROADMAP.md               # backlog feature specs
└── CLAUDE.md                # working notes for AI agents
```

## Testing & CI

Two test suites, both gated at **95% coverage** in CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

**Python** — 858 tests (pytest, branch coverage), currently **100%** across
`pipeline/`, `report/`, and `dashboard/`:

```bash
.venv/bin/python -m pytest                                   # run the suite
.venv/bin/python -m pytest --cov --cov-report=term-missing   # with coverage
```

**Frontend** — 358 tests (Vitest + Testing-Library, v8 coverage) over the
React/TS dashboard:

```bash
cd dashboard/web
npm run test:run    # run the suite
npm run coverage    # with coverage
```

On every push / pull request, CI runs both suites, prints the coverage tables to
the GitHub **job summary**, uploads the reports (`coverage.xml`, `lcov.info`) as
artifacts, and **fails the build if coverage drops below 95%**.

## Caveats (honest)

- **Capture is visible and effectively manual per session** — it runs through a **logged-in**
  Chrome (Claude-in-Chrome). The session is left untouched (no incognito/logout/account
  switch), since AI Overview depends on the account and locale.
- **Google AI Overview only, for now**, and the **AI Overview surface is non-deterministic**:
  the same query can return a different overview or none at all. open-geo captures what
  rendered *right now* and does not retry hoping for a "better" overview. Absence is **valid
  data** (`overview_present=false`) that feeds coverage — not a failure.
- **`--n-worker` is best-effort throughput on a single browser**, not guaranteed parallel
  browsers: there is effectively one visible Chrome session, so workers contend for one
  window. Keep it modest (1–3).
- **reCAPTCHA / "unusual traffic" risk** under load: on a challenge, capture **stops** and
  asks the human to solve it in the open Chrome window rather than hammering Google.
- **ToS gray area** — automating a search engine sits in a gray area of its terms of service.
  Use a **dedicated account**, keep volume low, and treat this as a measurement tool, not a
  scraper.

## License

MIT.
