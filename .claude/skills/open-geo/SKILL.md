---
name: open-geo
description: Run a list of queries through a chosen AI engine, measure the target domain's visibility/citation in the AI answers, and produce a dashboard or PDF report.
---

# open-geo — GEO visibility run orchestrator

You are the orchestrator for one **open-geo run**: drive a list of queries through one
AI engine, capture how the target domain shows up in the answers, ingest the captures
through the validated pipeline, aggregate metrics, and emit a dashboard and/or a PDF
report — finishing with a short summary.

This skill is the **single operator entry point**. It coordinates components that are
specified in `pipeline/INTERFACES.md` (the authoritative contract). Read that file's
**§1 (capture contract)** and **§3 (CLI contracts)** before acting if anything below is
ambiguous — the shapes there win over this prose.

> Conventions (from `CLAUDE.md`): code/identifiers and intermediate JSON are English.
> The **final summary printed to the user follows `--lang`** (default English). Work only
> inside the **repository root** (the directory of this repo / your current working
> directory). Run all Python with the project venv (`.venv/bin/python`) so `pipeline.*`
> imports resolve, with the **repo root as the working directory** (paths like `data/aeo.db`
> are repo-root-relative).

---

## INVOCATION

```
/open-geo <questions.csv> <engine> <domain> --brand "<name>" --n-worker <N> \
          [--output dashboard|pdf|both] [--period today|all] [--lang en|ru]
```

### Positional arguments

| arg | meaning |
|---|---|
| `<questions.csv>` | Path to the input CSV. Columns: **`query,lens`** where `lens ∈ general \| branded \| comparative`. See `examples/questions.csv` for a ready sample. `general` = neutral query, no brand named; `branded` = brand explicitly named; `comparative` = brand vs alternatives. |
| `<engine>` | Engine id, **snake_case**, e.g. `google_ai_overview`. This value is (a) the `engine` field written into every `QueryCapture` and the run, and (b) the basename of the capture playbook the workers load: `engines/<engine>.md`. |
| `<domain>` | The **target** domain to score. Accept any spelling (`https://www.acme.com`, `acme.com`); the pipeline normalizes it via `pipeline.schema.normalize_domain`. Workers match the target with this same normalizer so matching is consistent. |

### Flags

| flag | required | default | meaning |
|---|---|---|---|
| `--brand "<name>"` | yes | — | Human brand name (free text, may contain spaces — keep it quoted). Stored on the run; used in report/dashboard titles and the summary. |
| `--n-worker <N>` | yes | — | Number of capture subagents to fan out across. **Keep modest (1–3)** — see the parallelism caveat in step 4. |
| `--output dashboard\|pdf\|both` | no | `dashboard` | Which deliverable(s) to produce in step 6. |
| `--period today\|all` | no | `all` | Reporting window passed to the dashboard/report: `today` = just this run's date, `all` = full history for this brand+engine (enables the previous-run deltas described in INTERFACES §4.1). |
| `--lang en\|ru` | no | `en` | UI language for the deliverables: it is passed to the report (`report.generate --lang`) and is the dashboard's **default** language (the switcher can still change it in the browser). Extensible to any code registered in `i18n/locales.json`. It also sets the language of the **final summary** you print in step 7. |

If a required argument is missing or `questions.csv` does not exist / has no data rows,
**stop immediately** and print a short error (in `--lang`) explaining what is missing
(do not create an empty run).

---

## STEP 0 — PRE-GATE HOOK (design-only placeholder — DO NOT IMPLEMENT)

> **No-op for v1.** This section reserves the slot where the **Domain GEO-Audit Gate**
> (ROADMAP **Feature 2**) will run **FIRST**, before any run is created.
>
> When that gate exists it will: audit `<domain>` for baseline GEO readiness
> (crawl access, `robots.txt` AI-bot policy, SSR vs JS-only content, sitemap, structured
> data, `llms.txt`, …), and — per ROADMAP — **hard-stop only on category-A blockers**
> (the site is physically unreadable by AI crawlers), emitting a remediation report of
> "what to add". Everything else is advisory (warn + continue, overridable with
> `--force`). The gate is expected to cache results per domain (TTL).
>
> **For now there is nothing to call.** Do **not** implement the audit here and do not
> block the run. Treat this purely as the documented insertion point: if a future
> `python -m audit.gate --domain <domain>` (name TBD) is present and returns a hard
> blocker, this skill should abort before step 1 and surface the remediation report.
> Until then, proceed directly to step 1.

---

## STEP 1 — CREATE THE RUN

Create the brand (if new) and a fresh run, and capture the `run_id` from JSON stdout:

```bash
.venv/bin/python -m pipeline.ingest \
  --brand "<name>" --domain <domain> --engine <engine> --new-run
```

- **stdout:** `{"run_id": <int>}` (per INTERFACES §3.1). Parse it and keep `<run_id>`
  for every later step. Human/log noise goes to STDERR — only the JSON object is on STDOUT.
- If this command errors or stdout is not parseable JSON with a `run_id`, stop and report
  it (in `--lang`). Nothing downstream can proceed without `run_id`.

---

## STEP 2 — PREPARE THE WORK & THE PLAYBOOK

1. Read all data rows from `<questions.csv>` (header `query,lens`). Validate each `lens`
   is one of `general|branded|comparative`; drop/flag malformed rows (note them for the
   summary). Let `rows` be the validated list, preserving file order.
2. Locate the capture playbook **`engines/<engine>.md`**. This file is the per-engine
   capture instructions the subagents follow (e.g. `engines/google.md` for Google AI
   Overview — referenced in the house rules as "the capture playbook").
   - If `engines/<engine>.md` is **missing**, do not invent a procedure. Stop and tell the
     user (in `--lang`) that the playbook for this engine is not present yet and must be
     added before a run — the capture contract still applies, but the engine-specific "how
     to drive it" lives in that file. *(The `engines/` directory may be empty in early
     iterations — this is the expected guard until a playbook is authored.)*
3. Split `rows` into `min(N, len(rows))` contiguous chunks of roughly equal size, where
   `N = --n-worker`. Each chunk keeps its rows' original `(query, lens)` pairs.

---

## STEP 3 — FAN-OUT CAPTURE (subagents via the Task/Agent tool)

Spawn one capture **subagent per chunk** using the Task/Agent tool. Give each subagent a
self-contained brief containing:

- The **full text** of `engines/<engine>.md` (the capture playbook).
- Its **chunk** of `(query, lens)` rows.
- The **target `<domain>`** and **`--brand` name**, and the **`<engine>` id**.
- The **`run_id`** from step 1.
- A pointer to **`pipeline/INTERFACES.md` §1** as the authoritative capture contract, and
  to `pipeline/schema.py :: QueryCapture` / `normalize_domain`.

### What each subagent MUST do

1. For **every** `(query, lens)` in its chunk, drive the engine per the playbook and
   produce **one `QueryCapture` JSON object** (INTERFACES §1.1). Required fields and the
   rules that bite:
   - `engine` = the `<engine>` id; `lens` = the row's lens; `captured_at` = UTC ISO-8601
     (e.g. `2026-06-18T20:15:30Z`).
   - `overview_present` is the **denominator gate**: set it truthfully. If no AI answer
     rendered → `overview_present=false`, and then `sources=[]`, `citations=[]`, both rank
     arrays `[]`, `answer_text_md=null`, `brand_in_answer_text=false`, `sentiment=null`.
   - `sources` / `citations` are **ordered** `Link` lists (`rank` 1-based = array
     position), **duplicate domains allowed**. Compute each `Link.domain` with
     `normalize_domain(url)`.
   - `target_source_ranks` / `target_citation_ranks` list **every** position where the
     **normalized** target domain appears (ascending). `[]` if it never appears.
   - `brand_in_answer_text` = was the **brand name** in the prose (independent of links).
   - `sentiment` = one short qualitative phrase about how the answer treats the target —
     **`null` iff the target appeared nowhere** (prose or links). It is free text, never a
     number.
   - Optionally save a screenshot to `data/screenshots/<run_id>/<n>.png` and set
     `screenshot_path` (repo-root-relative).
2. Assemble the chunk's objects into a **JSON array** and feed it to ingest **on STDIN**:
   ```bash
   .venv/bin/python -m pipeline.ingest --run-id <run_id>
   ```
   (the array is piped to stdin; see INTERFACES §3.2).
3. Read ingest's stdout: `{"run_id", "ok": [...indices...], "errors": [{index, query, field, msg}, ...]}`.
   Invalid rows do **not** abort the batch — they come back in `errors`.
4. **Re-capture / fix** every row listed in `errors`: correct the offending `field` to
   satisfy the contract (`msg` tells you what failed), then re-send **only the fixed
   objects** as a new JSON array to the same `--run-id <run_id>` ingest call. Repeat until
   `errors` is empty (or, after a small bounded number of retries, report the residual
   failures upward rather than looping forever).
5. Finish by returning to the orchestrator a tiny status: how many objects it captured,
   how many `ok`, and any rows it could not get accepted.

### Parallelism caveat — STATE THIS PLAINLY

Capture drives **one visible, logged-in Chrome** (Claude-in-Chrome). There is effectively
a single browser session, so **true parallelism is limited**: subagents contend for one
window, and **Google may show a reCAPTCHA under load**. Therefore:

- Keep `--n-worker` **modest (1–3) for v1**.
- Treat `--n-worker` as **best-effort throughput / work partitioning, NOT guaranteed
  parallel browsers**. If contention or CAPTCHA appears, workers should serialize and slow
  down rather than hammer the engine. This is a known v1 limitation, not a bug.

---

## STEP 4 — FINALIZE THE RUN

After **all** subagents return, mark the run complete and set its counters. There is no
dedicated "finalize" CLI in INTERFACES; use the documented helper
`pipeline.db.update_run_counts` (INTERFACES §2) directly:

```bash
.venv/bin/python -c "
from pipeline.db import get_conn, update_run_counts
conn = get_conn('data/aeo.db')
update_run_counts(conn, run_id=<run_id>,
                  n_queries=<total rows attempted>,
                  n_ok=<rows accepted by ingest>,
                  n_failed=<rows never accepted>,
                  status='done')
"
```

- `n_ok` = total distinct rows ingest accepted across all workers; `n_failed` = rows that
  never made it in. Set `status='done'` on success, or `'failed'` if the run collapsed
  (e.g. playbook missing, engine unreachable for everything). A completed run with
  `status='done'` is what unlocks previous-run **deltas** for `--period all` (INTERFACES §4.1).

---

## STEP 5 — AGGREGATE METRICS

```bash
.venv/bin/python -m pipeline.aggregate --run-id <run_id>
```

- Computes metrics **per lens** plus one `lens="all"` aggregate row, writes them to the
  `metrics` table, and prints a JSON summary on stdout (INTERFACES §3.3). **Capture this
  stdout** — step 7's summary reads its `metrics` (`lens="all"` row) directly.

---

## STEP 6 — EMIT DELIVERABLE(S) per `--output`

> The **report** and **dashboard** components are **built** and their entry points are
> **verified working** (commands below are the real ones). They are intentionally **not in
> INTERFACES** — their contracts live in their own dirs (`report/generate.py` and
> `dashboard/README.md`). If you need detail beyond what's shown, read those.

### `--output dashboard` (default) — or as part of `both`

Start the dashboard (FastAPI backend + Vite/React frontend) and print the **local URL**.
The frontend selects brand/engine/period through its own UI controls (read from the API),
so you start the services and hand the operator the dev URL — you do **not** craft a
query-string-scoped link. The dashboard defaults its UI language to `--lang` (the in-browser
switcher can change it).

```bash
# 1) API (read-only over data/aeo.db). PICK A FREE PORT — see caveat below:
OPEN_GEO_DB=data/aeo.db .venv/bin/python -m uvicorn dashboard.api:app \
    --host 127.0.0.1 --port <PORT>

# 2) Web (Vite dev server):
cd dashboard/web && npm install && npm run dev   # serves http://localhost:5173
```

- **Port caveat:** local port **8000 is often already occupied** by another service on
  this machine. Pick a free port for the API (e.g. `8077`) and point the frontend at it via
  `VITE_API_BASE` (CORS is open, so a cross-origin base works without the dev proxy):
  ```bash
  VITE_API_BASE=http://127.0.0.1:<PORT> npm run dev
  ```
- After both are up, print the **Vite dev URL** the operator should open —
  `http://localhost:5173` (the frontend's own controls drive brand/engine/period, and the
  language switcher defaults to `--lang`). If `dashboard/` cannot be started, say so (in
  `--lang`) and skip gracefully (still finish steps 5 and 7).

### `--output pdf` — or as part of `both`

```bash
.venv/bin/python -m report.generate \
  --brand "<name>" --domain <domain> --engine <engine> \
  --period <period> --lang <lang> \
  --out reports/<brand>_<date>.pdf [--db data/aeo.db]
```

- This is the real, built CLI. It prints progress/status to **stderr**; the **output path**
  (`--out`) is what to surface to the operator. Pass `--lang <lang>` (the run's `--lang`,
  default `en`) so the report renders in that language.
- Use `<date>` = today (`YYYY-MM-DD`). Create `reports/` if missing. **Print the resulting
  file path.** If the command fails, say so (in `--lang`) and skip gracefully.

### `--output both`

Do **both** of the above: start the dashboard (print URL) **and** generate the PDF
(print path).

---

## STEP 7 — SUMMARY (printed to the user, in `--lang`)

Read the **`lens="all"`** row from the `pipeline.aggregate` JSON captured in step 5 and
print a short summary of headline metrics for this run, **in the `--lang` language** (default
English). Cover:

- **AI Overview coverage** (`overview_coverage`) — share of queries where an AI Overview
  rendered at all.
- **Visibility in sources** (`visibility_in_sources`) — share of overview queries where the
  target domain made it into `sources` (`n_in_sources / n_overviews`).
- **Visibility in citations** (`visibility_in_citations`) — share of overview queries where
  the domain is cited in the answer (`n_cited / n_overviews`).
- **Average source position** (`avg_source_position`) — average best (`min`) rank of the
  domain among sources (lower = better; `—` if the domain never appears in sources).
- **Average citation position** (`avg_citation_position`) — average best (`min`) rank of the
  domain among citations (lower = better; `—` if the domain is never cited).
- **Relative citation** (`relative_citation`) — the **source→citation conversion**: of the
  queries where the domain was in `sources`, the share where it was actually cited
  (`n_cited / n_in_sources`; **higher = better**, `∈ [0, 1]`; `—` if the domain never appears
  in sources). This is the last step of the visibility funnel
  (`n_cited ≤ n_in_sources ≤ n_overviews ≤ n_queries`).

Format as percentages where natural, and **note guard cases** (`null` → "no data" / "—", not
`0`). End by pointing to the produced deliverable(s): the dashboard URL and/or the PDF path.
If `--period all` and a previous completed run exists, you may mention the direction of change
(deltas are computed at read-time per INTERFACES §4.1) — otherwise omit.

Example shape (English; fill with real numbers; one `lens="all"` row drives it):

```
Run for brand "Acme" (engine google_ai_overview), queries: 30.
• AI Overview coverage: 73% (22 of 30 queries).
• Visibility in sources: 41% of overview queries.
• Visibility in citations: 32% of overview queries.
• Average source position: 2.4 (lower is better).
• Average citation position: 1.7 (lower is better).
• Source→citation conversion (relative citation): 78% (higher is better).
Report: reports/acme_2026-06-19.pdf · Dashboard: http://localhost:5173
```

---

## COMPONENT DEPENDENCY MAP (where this skill leans on others)

| step | calls | status |
|---|---|---|
| 0 | `audit.gate` (name TBD) | **Not built** — ROADMAP Feature 2; no-op placeholder for now |
| 1 | `python -m pipeline.ingest --new-run` | Contract in INTERFACES §3.1 |
| 3 | `engines/<engine>.md` playbook; `python -m pipeline.ingest --run-id` | Capture contract §1, ingest §3.2; playbook file may be absent early |
| 4 | `pipeline.db.update_run_counts` | Helper in INTERFACES §2 (no CLI — call inline) |
| 5 | `python -m pipeline.aggregate --run-id` | Contract in INTERFACES §3.3 |
| 6 | `python -m report.generate … --lang <lang>`; dashboard API (`uvicorn dashboard.api:app`) + web (`npm run dev`) | **Built** — entry points confirmed/working; contracts live in `report/` & `dashboard/` (intentionally not in INTERFACES) |

Keep the run operator-friendly: parse JSON from stdout (never scrape logs), fail loudly (in
`--lang`) on missing prerequisites, and never leave a run stuck in `status='running'`.
