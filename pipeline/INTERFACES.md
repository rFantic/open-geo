# open-geo — Pipeline Interfaces (the contract for all downstream agents)

> This is the **single source of truth** that every other agent (capture,
> ingest, aggregate, report, dashboard, skill) builds against. The shapes here
> are authoritative. Code identifiers are guaranteed English; user-facing
> docs/reports/UI are **English by default and localized via the i18n layer**
> (`--lang`, `i18n/<code>.json`) — but THIS file is English so all agents read
> it identically.
>
> **All of the following are implemented:** `pipeline/schema.py`,
> `pipeline/db.py`, the `python -m pipeline.ingest` and
> `python -m pipeline.aggregate` CLIs, the PDF report (`report.generate`), and
> the dashboard (`dashboard/api.py` + `dashboard/web/`).

---

## 1. The capture contract — `QueryCapture` JSON

The **capture agent** drives an engine (e.g. Google AI Overview) for one
`(query, lens)` and emits **one `QueryCapture` JSON object per query**. A batch
is a **JSON array** of these objects, fed to the ingest CLI on STDIN.

Canonical model: `pipeline/schema.py :: QueryCapture` (pydantic v2). Ingest
validates every object against it.

### 1.1 Field-by-field

| field | type | required | meaning |
|---|---|---|---|
| `query` | string | yes | The exact query sent to the engine. |
| `lens` | `"general" \| "branded" \| "comparative"` | yes | Framing of the query. `general` = neutral, no brand named; `branded` = brand explicitly named; `comparative` = brand vs alternatives. |
| `engine` | string | yes | Engine id, snake_case, e.g. `"google_ai_overview"`. |
| `captured_at` | string (ISO-8601 datetime) | yes | When the answer was captured. Parsed by pydantic into `datetime`. Use UTC, e.g. `"2026-06-18T20:15:30Z"`. |
| `answer_text_md` | string \| null | no (default `null`) | The answer prose as Markdown. `null` if no overview / not captured. |
| `screenshot_path` | string \| null | no (default `null`) | Path (relative to repo root) to a screenshot, e.g. `data/screenshots/<run>/<n>.png`. |
| `overview_present` | bool | yes | Did an AI Overview actually render for this query? This is the **denominator gate** for visibility metrics. |
| `sources` | array of `Link` | no (default `[]`) | The **relied-on / retrieved set** — every link the model drew on, in display order, **duplicate domains allowed**. This **includes every cited domain**: fold any inline-cited link into `sources` (the visible Google "sources panel" is only a *partial* view of the retrieval set, so a domain cited in the prose but missing from the panel is still a source). |
| `citations` | array of `Link` | no (default `[]`) | Links **attached / cited** in the answer prose, in order, duplicates allowed. Citations are a **subset of `sources`** (the model can only cite what it retrieved) — every domain here MUST also appear in `sources`. |
| `target_source_ranks` | array of int | no (default `[]`) | **ALL** 1-based positions of the target domain within `sources`. `[]` if the target never appears in sources. |
| `target_citation_ranks` | array of int | no (default `[]`) | Same, but for `citations`. |
| `brand_in_answer_text` | bool | yes | Was the brand **NAME** mentioned in the prose, independent of any link? |
| `sentiment` | string \| null | no (default `null`) | Short **qualitative** text describing how the answer treats the target domain (e.g. `"recommended as top pick"`, `"mentioned neutrally among 5 options"`). **`null` if the domain/brand did not appear at all.** This is free text, NOT a number. |

`Link` object:

| field | type | meaning |
|---|---|---|
| `rank` | int | 1-based position in its ordered list (`sources` or `citations`). |
| `url` | string | The full URL. |
| `domain` | string | Registrable domain, **lowercased, no `www`**. Produce it with `pipeline.schema.normalize_domain(url)`. |

### 1.2 Rules the capture agent MUST follow

- `rank` is **1-based** and matches array position (first link = rank 1).
- `target_source_ranks` / `target_citation_ranks` list **every** position of the
  target domain (a domain can legitimately appear more than once). Order them
  ascending.
- **Every domain in `citations` MUST also appear in `sources`** (fold inline-cited
  links into `sources` — citations ⊆ sources, because the model can only cite what
  it retrieved; the visible sources panel is just a partial view). Consequently a
  non-empty `target_citation_ranks` ⟹ a non-empty `target_source_ranks` for the
  same query.
- When `overview_present` is `false`: `sources`, `citations` and both rank
  arrays should be `[]`, `answer_text_md` is typically `null`, `sentiment` is
  `null`, `brand_in_answer_text` is `false`.
- `sentiment` is `null` **iff** the target did not appear (neither in prose nor
  in links). If it appeared anywhere, write one short qualitative phrase.
- Determine `domain` (and the target domain you match against) via
  `normalize_domain` so matching is consistent across the pipeline.

### 1.3 Example `QueryCapture` JSON object

```json
{
  "query": "best mattress for back sleepers",
  "lens": "general",
  "engine": "google_ai_overview",
  "captured_at": "2026-06-18T20:15:30Z",
  "answer_text_md": "For back sleepers, models with firm support are often recommended in this range. **Acme** offers several suitable options...",
  "screenshot_path": "data/screenshots/42/0003.png",
  "overview_present": true,
  "sources": [
    { "rank": 1, "url": "https://www.sleepfoundation.org/best-mattress", "domain": "sleepfoundation.org" },
    { "rank": 2, "url": "https://acme.com/catalog/back-support", "domain": "acme.com" },
    { "rank": 3, "url": "https://www.wirecutter.com/mattress/guide", "domain": "wirecutter.com" },
    { "rank": 4, "url": "https://acme.com/blog/how-to-choose", "domain": "acme.com" }
  ],
  "citations": [
    { "rank": 1, "url": "https://acme.com/catalog/back-support", "domain": "acme.com" }
  ],
  "target_source_ranks": [2, 4],
  "target_citation_ranks": [1],
  "brand_in_answer_text": true,
  "sentiment": "recommended among suitable options, mentioned by name with a direct catalog link"
}
```

A batch fed to ingest is simply: `[ {QueryCapture}, {QueryCapture}, ... ]`.

---

## 2. Database — `data/aeo.db` (SQLite, WAL mode)

- **Location:** `data/aeo.db` (relative to repo root). Opened via
  `pipeline.db.get_conn(db_path="data/aeo.db")`, which sets
  `PRAGMA journal_mode=WAL;` and `PRAGMA foreign_keys=ON;`.
- **Schema creation:** `pipeline.db.init_db(conn)` — idempotent
  (`CREATE TABLE IF NOT EXISTS`). Safe to call on every startup.
- Arrays / nested objects are stored as **JSON strings** in `*_json` columns.

### Tables

**`brands`**

| column | type | notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT | brand name |
| `domain` | TEXT | normalized registrable domain |
| `created_at` | TEXT | ISO-8601 |
| — | | `UNIQUE(name, domain)` |

**`runs`**

| column | type | notes |
|---|---|---|
| `id` | INTEGER PK | |
| `brand_id` | INTEGER | FK → `brands(id)` |
| `engine` | TEXT | |
| `run_at` | TEXT | ISO-8601 |
| `status` | TEXT | default `'running'` (e.g. `running` → `done`/`failed`) |
| `n_queries` | INTEGER | default 0 |
| `n_ok` | INTEGER | default 0 |
| `n_failed` | INTEGER | default 0 |

**`results`** (one row per captured query = one serialized `QueryCapture`)

| column | type | notes |
|---|---|---|
| `id` | INTEGER PK | |
| `run_id` | INTEGER | FK → `runs(id)` |
| `query` | TEXT | |
| `lens` | TEXT | |
| `captured_at` | TEXT | |
| `answer_text_md` | TEXT | |
| `screenshot_path` | TEXT | |
| `overview_present` | INTEGER | 0/1 |
| `sources_json` | TEXT | JSON array of `Link` |
| `citations_json` | TEXT | JSON array of `Link` |
| `target_source_ranks_json` | TEXT | JSON array of int |
| `target_citation_ranks_json` | TEXT | JSON array of int |
| `brand_in_answer_text` | INTEGER | 0/1 |
| `sentiment` | TEXT | qualitative text or NULL |

**`metrics`** (one row per lens + one `lens="all"` aggregate row per run)

| column | type | notes |
|---|---|---|
| `id` | INTEGER PK | |
| `run_id` | INTEGER | FK → `runs(id)` |
| `brand_id` | INTEGER | |
| `engine` | TEXT | |
| `lens` | TEXT | a specific lens, or `"all"` for the cross-lens aggregate |
| `n_queries` | INTEGER | total queries in scope |
| `n_overviews` | INTEGER | queries with `overview_present=1` |
| `overview_coverage` | REAL \| NULL | see §4 (NULL when `n_queries=0`) |
| `n_in_sources` | INTEGER | queries (among overview-present) with non-empty `target_source_ranks` |
| `visibility_in_sources` | REAL \| NULL | see §4 (NULL when `n_overviews=0`) |
| `n_cited` | INTEGER | queries (among overview-present) with non-empty `target_citation_ranks` |
| `visibility_in_citations` | REAL \| NULL | see §4 (NULL when `n_overviews=0`) |
| `avg_source_position` | REAL \| NULL | see §4 (NULL when `n_in_sources=0`) |
| `avg_citation_position` | REAL \| NULL | see §4 (NULL when `n_cited=0`) |
| `relative_citation` | REAL \| NULL | see §4 (NULL when `n_in_sources=0`) |
| `computed_at` | TEXT | ISO-8601 |

> **Schema change / migration:** `relative_citation` was **RE-ADDED** (reversing
> its earlier removal — it is valid because citations ⊆ sources, so the ratio is
> bounded; see §4). `visibility_in_citations` and `avg_citation_position` remain.
> Since `init_db` uses `CREATE TABLE IF NOT EXISTS`, DBs created before this
> change must `DROP TABLE IF EXISTS metrics;` then re-run `pipeline.aggregate`
> (metrics are derived from `results` — no data loss).
>
> **Filename note:** `aeo.db` is a **historical filename** (the project is now
> *open-geo* / GEO); it is kept as-is for compatibility and carries no meaning
> beyond "the working SQLite DB".

### DB helpers provided by `pipeline/db.py`

- `get_conn(db_path="data/aeo.db") -> sqlite3.Connection`
- `init_db(conn) -> None`
- `get_or_create_brand(conn, name, domain) -> int` (normalizes `domain`)
- `create_run(conn, brand_id, engine) -> int` (status `'running'`)
- `update_run_counts(conn, run_id, n_queries=?, n_ok=?, n_failed=?, status=?) -> None`

---

## 3. CLI contracts — `pipeline.ingest` and `pipeline.aggregate`

> **Both CLIs are implemented.** This section is the authoritative contract they
> conform to. All CLIs print a **single JSON object to STDOUT** (so callers can
> parse it); human/log noise goes to STDERR.

### 3.1 `python -m pipeline.ingest --brand "<name>" --domain <domain> --engine <engine> --new-run`

- Ensures the brand exists (`get_or_create_brand`), creates a new run
  (`create_run`) for that brand+engine.
- **STDOUT:** `{"run_id": <int>}`

### 3.2 `python -m pipeline.ingest --run-id <N>`  (JSON array of `QueryCapture` on STDIN)

- Reads a JSON **array** of `QueryCapture` objects from STDIN.
- Validates **each** object against `pipeline.schema.QueryCapture`.
- Writes every **valid** row to `results` (serializing arrays to the `*_json`
  columns). **Invalid rows do NOT abort the batch** — they are collected into
  `errors` so the capture agent can fix and re-send.
- Should update run counters (`n_queries`, `n_ok`, `n_failed`) via
  `update_run_counts`.
- **STDOUT:**
  ```json
  {
    "run_id": N,
    "ok": [0, 1, 3],
    "errors": [
      { "index": 2, "query": "<query or null>", "field": "<field path>", "msg": "<validation message>" }
    ]
  }
  ```
  - `ok` = indices (0-based, by position in the input array) of rows written.
  - `errors` = one entry per rejected row; `index` is its position in the input
    array, `field`/`msg` come from the pydantic `ValidationError` (first error is
    sufficient). `query` echoes the offending object's `query` if present, else
    `null`.

### 3.3 `python -m pipeline.aggregate --run-id <N>`

- Reads all `results` for run `N`, computes metrics **per lens** plus one
  `lens="all"` aggregate row, writes them to `metrics`, and prints a summary.
- **STDOUT:** a JSON summary, e.g.
  ```json
  {
    "run_id": N,
    "brand_id": 1,
    "engine": "google_ai_overview",
    "metrics": [
      { "lens": "all", "n_queries": 30, "n_overviews": 22, "overview_coverage": 0.733,
        "n_in_sources": 9, "visibility_in_sources": 0.409,
        "n_cited": 7, "visibility_in_citations": 0.318,
        "avg_source_position": 2.4, "avg_citation_position": 1.7,
        "relative_citation": 0.778 },
      { "lens": "general", "...": "..." },
      { "lens": "branded", "...": "..." },
      { "lens": "comparative", "...": "..." }
    ]
  }
  ```
- A lens row is emitted only for lenses present in the run's results; the `all`
  row is always emitted.

---

## 4. Metric definitions & formulas

**Denominator for visibility = overview-present queries** (this is the key
modeling choice: you can only be visible where an overview rendered).

Let, within a scope (a specific lens, or `all` = across all lenses of the run):

- `n_queries`   = number of results in scope.
- `n_overviews` = results with `overview_present = 1`.
- `n_in_sources` = results (**among overview-present**) with non-empty
  `target_source_ranks`.
- `n_cited`     = results (**among overview-present**) with non-empty
  `target_citation_ranks`. Counts each query **once** even if the domain is
  cited multiple times (presence, not occurrences).

The model is a **funnel**. Because capture folds every cited link into `sources`
(citations ⊆ sources — the model can only cite what it retrieved; see §1), the
counts nest within any scope:

```
n_cited  ≤  n_in_sources  ≤  n_overviews  ≤  n_queries
```

Read it as: of all queries, some render an overview; of those, in some the domain
is **retrieved into `sources`** (the relied-on set); of those, in some it is
actually **cited** in the answer prose. The visible Google "sources panel" is only
a *partial* view of the retrieval set, so a domain cited in the prose but absent
from the panel is still recorded as a source — which is exactly why the funnel
holds and `n_cited` can never exceed `n_in_sources`.

| metric | formula | guard |
|---|---|---|
| `overview_coverage` | `n_overviews / n_queries` | `null` if `n_queries = 0` |
| `visibility_in_sources` | `n_in_sources / n_overviews` | `null` if `n_overviews = 0` |
| `visibility_in_citations` | `n_cited / n_overviews` | `null` if `n_overviews = 0` |
| `avg_source_position` | mean over in-sources queries of `min(target_source_ranks)` | `null` if `n_in_sources = 0`; lower = better |
| `avg_citation_position` | mean over cited queries of `min(target_citation_ranks)` | `null` if `n_cited = 0`; lower = better |
| `relative_citation` | `n_cited / n_in_sources` | `null` if `n_in_sources = 0`; ∈ `[0, 1]`; higher = better |

Notes:

- Both `avg_*_position` metrics use the **best (smallest)** rank per query
  (`min(...)` of that channel's rank array), then average those across the
  queries where the domain appears **in that channel**. Lower is better.
- **`relative_citation` is RESTORED** (reversing its earlier removal). It is the
  **source→citation conversion** — the last step of the funnel: *of the queries
  where you were retrieved into `sources`, in what share did the model actually
  cite you?* It is valid **precisely because citations ⊆ sources**, so
  `n_cited ≤ n_in_sources` and the ratio is bounded to `[0, 1]`; **higher is
  better**. (The earlier removal assumed citations ⊄ sources, reading the
  partial sources panel as the whole retrieval set — that was a UI-panel
  artifact; capture now folds cited links into `sources`, so the funnel is
  well-defined.)
- **`sentiment` is QUALITATIVE** (free text, per query in `results.sentiment`).
  It is **NOT** aggregated into any numeric metric. Report and dashboard read it
  directly per query. There is intentionally **no composite index, no
  share-of-voice, and no competitor modeling** in v1.

### 4.1 Deltas (computed at read-time, NOT stored)

Deltas are computed by **report/dashboard at read-time**, by comparing a run's
`metrics` to the **previous completed run** of the **same brand + engine**
(i.e. the most recent run with `status='done'` and an earlier `run_at`, matched
per `lens`). Deltas apply to `overview_coverage`, `visibility_in_sources`,
`visibility_in_citations`, `avg_source_position`, `avg_citation_position`, and
`relative_citation` (for the two `avg_*_position` deltas, remember **lower =
better**, so a negative delta is an improvement). **Do not store deltas** in any
table — derive them on read.

---

## 5. Quick usage sketch (foundation pieces only)

```python
from pipeline.db import get_conn, init_db, get_or_create_brand, create_run
from pipeline.schema import QueryCapture, normalize_domain

conn = get_conn("data/aeo.db")
init_db(conn)
brand_id = get_or_create_brand(conn, "Acme", "https://www.acme.com")  # -> stores "acme.com"
run_id = create_run(conn, brand_id, "google_ai_overview")

cap = QueryCapture.model_validate_json(some_json_string)  # raises ValidationError on bad input
```
