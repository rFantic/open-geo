---
name: bug-hunt
description: Find one real, unknown bug in this repo's code, prove it with a failing test, make a minimal fix, run the full suite, and open a PR. Use for /bug-hunt or when asked to hunt/find/look for a bug or defect (off-by-one, bad guard, unhandled None, race, contract drift) in a module or file — a discovery pass, not fixing a bug the user already pinpointed.
argument-hint: "[path/to/module]   # optional focus, e.g. pipeline/ or report/generate.py"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(.venv/bin/python:*), Bash(git:*), Bash(gh:*)
---

# bug-hunt — one focused pass

Goal: land **one** real, fully verified bug fix per run. Quality over quantity — never batch
speculative changes. If you find nothing real, say so and change nothing.

## Scope
- If an argument was given, restrict to that path. Otherwise pick ONE high-value file
  (recently changed, or core: `pipeline/`, `report/`, `dashboard/api.py`). Announce your pick.
- Touch as few files as possible. One bug, one fix.

## Steps
1. **Hunt.** Read the chosen code and find ONE concrete defect you can prove: wrong guard,
   off-by-one, unhandled `None`/empty, race on shared state or temp files, wrong
   `normalize_domain` usage, metric/funnel drift vs `pipeline/INTERFACES.md §4`, swallowed
   exception. Prefer provable bugs over style nits.
2. **Prove it.** Write a **failing** test under `tests/` that demonstrates the bug, then run
   only it and confirm it FAILS for the right reason:
   `.venv/bin/python -m pytest tests/<file>::<test> -x`
3. **Fix the code** (not the test). Keep the change minimal and targeted.
4. **Verify the whole suite** — nothing regressed:
   `.venv/bin/python -m pytest -q`
   - All green → continue. Any red → your fix caused a regression: **revert your code change**
     (`git checkout -- <file>`) and report what you found instead of layering more fixes.
5. **Land it.** New branch, commit, open a PR describing the bug, the proof, and the fix:
   `git switch -c fix/<short-slug>` → commit → `gh pr create`. Do **not** push to main.

## Project rules (from CLAUDE.md — follow exactly)
- **No comments/docstrings** in code or tests — knowledge lives in `.md` docs; use
  self-documenting names. (Functional directives like `# type: ignore` are allowed.)
- If the fix changes a **contract** (`QueryCapture`, metrics, DB schema, CLI, command
  behavior): sync `pipeline/INTERFACES.md` first, then dependent docs, and add a line to
  `RECENT_CHANGES.md` — per the doc-discipline convention. A purely internal fix needs no cascade.
- Run Python via `.venv/bin/python` from the repo root.

## Stop conditions
- One landed PR per run, OR an honest "clean — no real bug found" with zero changes.
- Never fix the same failing test twice in a row — if a fix won't hold, revert and report.
