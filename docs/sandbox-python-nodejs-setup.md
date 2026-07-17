---
id: "sandbox-python-nodejs-setup"
title: "Sandbox Python & Node.js Environment Setup"
tags: ["setup", "uv", "npm", "sandbox", "environment"]
scope: "Guides a developer through installing dependencies and running tests inside this distrobox sandbox, where /tmp is ephemeral and parts of the home directory are read-only."
source_files: [".gitignore", "pyproject.toml", "package.json", "vitest.config.ts"]
analyzed_commit: "603595fdfad56dbe01dde5f020c2d897688d789f"
analyzed_at: "2026-07-14T01:54:31Z"
status: "current"
---

## Overview

This distrobox sandbox has two quirks that block standard tooling:

1. **`/tmp` is not shared across bash calls** — each invocation gets a fresh `/tmp`.
2. **Parts of `$HOME` are read-only** — notably `~/.local/share/uv/python` and `~/.npm`.

This document records the working configuration so you don't have to rediscover it.

## Python (uv)

### Constraint
`uv` downloads managed CPython interpreters to `~/.local/share/uv/python`, which is **read-only** here. You must redirect that directory to writable, persistent space.

### Failed approach — `/tmp`
Redirecting via `UV_PYTHON_INSTALL_DIR=/tmp/uv-python` works for a single call (the interpreter downloads and the venv is created), but the venv symlinks to that interpreter and **`/tmp` is wiped between calls** — the next call sees a broken symlink:

```
Broken symlink at `.venv/bin/python3`, was the underlying Python interpreter removed?
```

### Working approach — project-local `.uv/`
Install the managed Python **inside the project directory** so it persists across calls. Add `.uv/` to `.gitignore` (`.venv/` should already be listed):

```bash
# .gitignore
.venv/
.uv/
```

Create the venv:

```bash
export UV_PYTHON_INSTALL_DIR="$PWD/.uv/python"
uv venv --python 3.12
```

Verify it survived into a fresh shell:

```bash
.venv/bin/python3 --version   # Python 3.12.13
```

Install dependencies (uses `~/.cache/uv`, which **is** writable):

```bash
uv pip install -e .
```

### Result
Python 3.12.13 venv at `.venv/`, 37 packages installed, **1030 tests pass** (~9 s).

## Node.js (npm)

### Constraint
`npm` caches packages in `~/.npm`, which is **read-only** here. An unmodified `npm install` fails with a write error.

### Working approach — redirect cache to project-local `.npm-cache/`

```bash
npm install --cache .npm-cache
```

Add `.npm-cache/` to `.gitignore` as well so it isn't committed.

### Result
193 packages installed, 0 vulnerabilities.

### Frontend test caveat (jsdom + Node version)
This sandbox currently runs **Node v26.5** alongside bleeding-edge dependency versions (`jsdom 29`, `vitest 4`, `vite 8`). CI targets **Node 22**. Under Node 26, `window.localStorage` is `undefined` in the jsdom environment, causing ~183 test failures (`TypeError: Cannot read properties of undefined (reading 'clear')`). These failures are **environmental**, not real code bugs. To get a true signal, run the frontend suite on Node 22 (e.g., via `nvm use 22` or in CI).

## Quick-reference cheat sheet

```bash
# Python
export UV_PYTHON_INSTALL_DIR="$PWD/.uv/python"
uv venv --python 3.12
uv pip install -e .
pytest                       # 1030 passed

# Node.js
npm install --cache .npm-cache
npx vitest run               # use Node 22 for full reliability
```

### Persistence rules of thumb
| Path            | Persists across calls? | Writable? |
|-----------------|:----------------------:|:---------:|
| project dir     | yes                    | yes       |
| `~/.cache/uv`   | yes                    | yes       |
| `~/.local/share`| yes                    | **no**    |
| `~/.npm`        | yes                    | **no**    |
| `/tmp`          | **no**                 | yes       |
