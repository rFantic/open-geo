# open-geo — Claude Code plugin manifests

This directory holds the **optional** one-command-install path for open-geo as a
Claude Code plugin:

- `plugin.json` — the plugin manifest (skill lives at `.claude/skills/open-geo/`).
- `marketplace.json` — a single-plugin marketplace listing this repo (`source: "./"`).

Install (from a Claude Code session):

```
/plugin marketplace add <this-repo-url-or-local-path>
/plugin install open-geo@open-geo-marketplace
```

> **Installing the plugin does NOT finish setup.** The plugin only registers the
> `/open-geo` skill. To actually run a visibility pass you still need to:
>
> 1. Run **`scripts/setup.sh`** in the repo (creates `.venv`, installs Python deps,
>    runs `npm install` for the dashboard frontend), and
> 2. Have a **connected Claude-in-Chrome MCP** plus a **visible, logged-in Chrome**
>    session for the target engine — capture is manual and not headless.
>
> The robust, fully supported path remains: clone the repo and run
> `scripts/setup.sh`. The plugin install is a convenience wrapper on top of that.

Schema reference (verified against the official Claude Code docs):
- Plugin manifest: https://code.claude.com/docs/en/plugins-reference#plugin-manifest-schema
- Marketplace: https://code.claude.com/docs/en/plugin-marketplaces
