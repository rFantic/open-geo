---
id: "git-remote-setup"
title: "Git Remote Configuration & Fork Workflow"
tags: ["git", "fork", "remotes", "github", "setup"]
scope: "Documents the git remote topology: origin points to the rFantic/open-geo fork (push target), upstream to Pupok462/open-geo (source of truth). Covers how the fork was created, how to sync with upstream, and the push permission model."
source_files: []
analyzed_commit: "3d35dba72728dfe5ad0070e2346278f9241a234c"
analyzed_at: "2026-07-17T05:05:31Z"
status: "current"
---

## Git Remote Topology

This repository is a fork-based contribution setup. Two remotes are configured:

| Remote | URL | Role |
|--------|-----|------|
| `origin` | `https://github.com/rFantic/open-geo.git` | Fork (push target — `rFantic` has write access) |
| `upstream` | `https://github.com/Pupok462/open-geo` | Original repo (read-only source of truth) |

## How the Fork Was Created

The fork was created via `gh repo fork Pupok462/open-geo --remote=false` (no automatic remote rewiring), then remotes were set explicitly:

```bash
git remote rename origin upstream
git remote add origin https://github.com/rFantic/open-geo.git
git push -u origin main
```

This ensured full control over the remote configuration rather than accepting `gh` defaults.

## Syncing with Upstream

To pull changes from the original repository:

```bash
git fetch upstream
git merge upstream/main   # or: git rebase upstream/main
```

## Push Permissions

- **`origin` (rFantic/open-geo)**: Push succeeds — `rFantic` owns this fork.
- **`upstream` (Pupok462/open-geo)**: Push returns `403 Permission denied` unless `rFantic` is added as a collaborator on GitHub.

## Upstream Contribution (out of scope)

This setup is for **local testing only**. `rFantic` is **not** a collaborator on `Pupok462/open-geo`, so no pull requests or pushes to `upstream` are intended — the `upstream` remote exists solely to fetch updates from the source repo. Contributing back would require being added as a collaborator on GitHub first, which is out of scope here.

## Authenticated Account

GitHub CLI is authenticated as **`rFantic`` with `repo` and `workflow` token scopes.
