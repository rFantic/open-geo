---
name: doc-sync
description: Detect (and with --fix, repair) drift between this repo's code and its product docs, with pipeline/INTERFACES.md as source of truth. Use for /doc-sync or when asked whether the docs match the code, if the docs/INTERFACES/README are stale or out of sync, or to run a code-vs-docs consistency check — not for writing new docs or general prose editing.
argument-hint: "[--fix]   # default report-only; pass --fix to update docs to match"
allowed-tools: Read, Edit, Bash(grep:*), Bash(rg:*), Bash(.venv/bin/python:*)
---

# doc-sync — code ⇆ docs consistency check

Enforces the project's #1 convention: **code and docs never diverge**, with
`pipeline/INTERFACES.md` as source of truth. Default mode is **report-only**; edit docs only
when invoked with `--fix`.

## What to compare
Authority order: `pipeline/INTERFACES.md` (contract) → then code → then every other doc must
match. Check these pairs:

1. **`QueryCapture` fields** — `pipeline/schema.py` vs `INTERFACES.md §1`: every field, type,
   and null/guard rule (`overview_present` gate, `sentiment` null-iff-absent, rank arrays).
2. **CLI contracts** — actual CLIs in `pipeline/ingest.py`, `pipeline/aggregate.py`,
   `report/generate.py` vs `INTERFACES.md §3` (stdout JSON shapes especially).
3. **Metrics & funnel** — formulas in `pipeline/aggregate.py` vs `INTERFACES.md §4`
   (`n_cited ≤ n_in_sources ≤ n_overviews ≤ n_queries`, `relative_citation` definition).
4. **Operator command** — `.claude/skills/open-geo/SKILL.md` invocation/flags vs the real
   CLIs it calls, and vs `CLAUDE.md` Architecture.
5. **READMEs & playbooks** — `README.md`, `README.ru.md`, `dashboard/README.md`,
   `engines/*.md`: any claim about fields, metrics, flags, or capture behavior that
   contradicts the contract or code.

## How to run
1. Read `INTERFACES.md` fully (it wins), then the code files above.
2. Diff *meaning*, not formatting. Use grep/rg to locate field names, flags, formula terms
   across docs: `rg -n "relative_citation|overview_present|n_in_sources" --glob '*.md'`
3. Produce a **drift report**: a table of `where | says | should say | authority`.
4. If `--fix`: update the **docs** (never code/contract) to match authority — `INTERFACES.md`
   first if the contract itself is wrong, else the lagging doc — and add one line to
   `RECENT_CHANGES.md` (date + what/why). Leave code edits to a human.

## Rules
- Report-only by default. `--fix` edits docs, not code.
- Never "fix" intentional exceptions noted in CLAUDE.md gotchas (e.g. the seed/test layer
  staying on `google_ai_overview`; the annotated `dashboard/README.md` curl probe).
- Run Python via `.venv/bin/python` from the repo root.
