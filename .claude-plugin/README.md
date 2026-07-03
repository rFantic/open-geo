# open-geo — Claude Code plugin manifests

This directory holds the **optional** one-command-install path for open-geo as a
Claude Code plugin:

- `plugin.json` — the plugin manifest (skill at `.claude/skills/open-geo/`, worker
  agents at `.claude/agents/` — both declared via custom paths, since this repo keeps
  them under `.claude/` instead of the default plugin-root `skills/` + `agents/`;
  note the schema wants `skills` as a directory string but `agents` as an array of
  explicit `.md` file paths — a new agent must be appended to that array).
- `marketplace.json` — a single-plugin marketplace listing this repo (`source: "./"`).

Install (from a Claude Code session):

```
/plugin marketplace add <this-repo-url-or-local-path>
/plugin install open-geo@open-geo-marketplace
```

> **Release ritual — bump `version` on every plugin-visible change.** Installed plugins
> only receive updates when `version` changes in BOTH `plugin.json` and the `plugins[0]`
> entry of `marketplace.json`; pushing commits without a bump leaves every installed copy
> stale. Any edit to `SKILL.md`, the agents, or these manifests ⇒ bump both, then users
> pick it up via `/plugin update open-geo`.
>
> **Namespacing.** Plugin skills are namespaced: the plugin-installed command is
> `/open-geo:open-geo`. The plain `/open-geo` form exists only when working from a repo
> clone (project-level `.claude/skills/`).

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
