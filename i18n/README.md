# i18n — single source of truth for UI strings

This directory holds **every user-facing UI string** for open-geo (dashboard +
PDF report) in one place. English is the canonical, authoritative locale;
Russian, Chinese and Arabic ship alongside it. Adding a language is dropping one JSON file.

```
i18n/
  en.json        # CANONICAL key set, English values — every key MUST exist here
  ru.json        # same keys, Russian values
  zh.json        # same keys, Simplified Chinese values
  ar.json        # same keys, Arabic values
  locales.json   # registry of available languages (drives the switcher)
  README.md      # this file
```

## Key namespaces

- `common.*` — shared chrome: app title/subtitle/tagline, "Download PDF",
  "lower is better", generic words.
- `metrics.*` — the 6 metrics, shared by **both** dashboard and report. Each has
  `.label` and `.hint`:
  `metrics.overview_coverage`, `metrics.visibility_in_sources`,
  `metrics.visibility_in_citations`, `metrics.avg_source_position`,
  `metrics.avg_citation_position`, `metrics.relative_citation`.
- `lens.*` — `all`, `general`, `branded`, `comparative`.
- `period.*` — `today`, `all`.
- `status.*` — run statuses (`done`, `running`, `failed`).
- `dashboard.*` — dashboard-only strings: controls, chart, tables, run/delta
  wording, language-switcher label, report-button error messages.
- `report.*` — report-only strings: cover, section titles, table headers,
  funnel/history/sentiment labels, footer.

Some values contain `{placeholders}` (e.g. `{n}`, `{id}`, `{datetime}`,
`{current}`). The consumer substitutes them at format time; keep the same
placeholder names when translating.

## Add a language

1. Copy `en.json` → `<code>.json` (e.g. `de.json`). Keep **all keys**; translate
   only the values. Preserve `{placeholders}` verbatim.
2. Add an entry to `locales.json`:
   `{ "code": "<code>", "name": "<native display name>" }`
   (`name` is what shows in the switcher, in the language's own script).
3. Done. The dashboard switcher picks it up automatically (it reads
   `locales.json`), and the report accepts `report --lang <code>`.

Missing keys fall back to `en` per key, so a partial translation never breaks the
UI — untranslated strings just render in English.

`en.json` is authoritative: every key must exist there. CI / review should treat
the flattened key set of `en.json` as the contract that every other locale
mirrors.

## Consumption contract (Phase-2 agents)

### Dashboard (FastAPI + React)

- **Backend** — add two read-only endpoints:
  - `GET /api/i18n` → the contents of `locales.json` (the `[{code,name}]` array).
  - `GET /api/i18n/{code}` → that locale's dict. If `{code}` is unknown, fall
    back to `en` (or `404`); the frontend's per-key fallback covers the rest.
  - Locale files are static JSON read from this `i18n/` dir, resolved relative to
    the repo root (same pattern as `OPEN_GEO_DB` resolution in `dashboard/api.py`).
- **Frontend**:
  - Fetch `GET /api/i18n` for the switcher list, and `GET /api/i18n/<chosen>`
    for the active dict.
  - Look strings up via `t("namespace.key")` (e.g. `t("metrics.overview_coverage.label")`).
  - Default language `en`. Persist the user's choice in `localStorage`.
  - Fallback is **per key**: if a key is absent in the chosen dict, read it from
    the `en` dict; if absent there too, show the key.
  - Render `{placeholders}` by substituting at call sites.

### Report (`report/generate.py`)

- Load `i18n/<lang>.json`, **merged over `en.json`** so any missing key falls
  back to English.
- Add a `--lang` flag: `--lang en|ru|zh|ar` (extensible to any registered code),
  default `en`.
- Resolve the `i18n/` path relative to the repo root, independent of CWD.

## Two clarifications

1. **Only UI chrome is translated.** Captured **data** — query text, sentiment
   text, domains, brand names — is shown as-is and is **never** routed through
   i18n. (Engine identifiers like `google` are also data; display
   them verbatim.)
2. **UI language ≠ capture market.** The language of the interface is independent
   of the engine's locale/market the answers were captured in. Do not conflate
   them: a Russian-market capture can be viewed through an English UI, and vice
   versa. The capture market stays a separate setting on the run.
