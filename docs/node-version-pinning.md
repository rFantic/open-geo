---
id: "node-version-pinning"
title: "Node Version Pinning for Frontend"
tags: ["setup", "node", "nvm", "ci", "frontend"]
scope: "Explains how the frontend Node.js version is pinned via .nvmrc and package.json engines, ensuring local dev matches CI and avoiding jsdom incompatibilities with newer Node releases."
source_files: ["dashboard/web/.nvmrc", "dashboard/web/package.json"]
analyzed_commit: "603595fdfad56dbe01dde5f020c2d897688d789f"
analyzed_at: "2026-07-17T04:45:36Z"
status: "current"
---

## Overview

The frontend requires Node.js 22 LTS. This is now enforced via two complementary mechanisms so local development matches CI exactly.

## Mechanisms

### 1. `.nvmrc` (dashboard/web/.nvmrc)

Contains `22`. Version managers (nvm, fnm) auto-select Node 22 when entering the directory:

```bash
cd dashboard/web
nvm use   # or: fnm use
```

### 2. `engines` field (dashboard/web/package.json)

```json
"engines": { "node": "22" }
```

npm resolves this to `>=22.0.0 <23.0.0`, which correctly includes all 22.x releases while excluding Node 23+ that can break jsdom compatibility.

## Why Node 22

- CI runs on Node 22 (per `.github/workflows/ci.yml`).
- jsdom (used by Vitest) has known incompatibilities with newer Node versions.
- Node 22 is the active LTS line.

## CI Coverage Gates

Both coverage gates pass at current pinning:

| Gate | Tests | Coverage | Threshold |
|---|---|---|---|
| Python `pytest --cov-fail-under=95` | 1030 passed | 99.23% branch | ≥95% |
| Frontend `vitest run --coverage` | 380 passed / 16 files | Stmts 98.72 · Branch 96.46 · Funcs 100 · Lines 100 | ≥95% all |

## Verification

After pulling changes:
```bash
cd dashboard/web
nvm use        # reads .nvmrc
node -v        # should show v22.x
npm test       # 380 tests, all green
```
