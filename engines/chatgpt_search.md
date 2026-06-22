# Capture Playbook — ChatGPT (web search)

> **What this is.** A prompt for a Claude Code agent driving a **real, logged-in
> Chrome** via the Claude-in-Chrome browser tools (`mcp__Claude_in_Chrome__*`).
> You capture **ONE `(query, lens)`** into **exactly one `QueryCapture` JSON
> object**. The orchestrator runs you once per query and collects the objects
> into a batch array — **you do not emit the array, only your single object.**
>
> **Authoritative contract:** `pipeline/INTERFACES.md` §1 (fields, rules §1.2,
> example §1.3) and `pipeline/schema.py` (`QueryCapture`, `Link`,
> `normalize_domain`). If anything here disagrees with those, **they win.**
> Read them if unsure; do not invent fields.
>
> You are an **LLM reading rendered content**. Read the page **semantically** —
> the landmark hints below are *hints*, not selectors. Do **not** depend on
> brittle CSS/XPath; ChatGPT's DOM and class names drift constantly.
>
> **This is an "always-answering" assistant — the gate is different from Google.**
> ChatGPT almost always replies, so "did it reply" is meaningless as a denominator.
> The meaningful gate here is **"did it run a web search and render a grounded,
> sourced answer"** — see step 2 (`overview_present` reinterpreted as
> *grounded-answer present*, per `pipeline/INTERFACES.md` §4 Scope note and
> `engines/README.md`).

---

## Inputs you are given (per invocation)

- `query` — the exact string to send to ChatGPT. Send it verbatim.
- `lens` — one of `general` | `branded` | `comparative` (already decided
  upstream; copy it through, do not re-classify).
- **target brand `name`** — e.g. `Example` (for `brand_in_answer_text`).
- **target `domain`** — e.g. `example.com` or `https://www.example.com` (you will
  normalize it; see step 5).

`engine` — the engine id the orchestrator passes you, **copied through verbatim**. For
this playbook that is **`chatgpt_search`** (it matches this file's basename,
`engines/chatgpt_search.md`). Do **not** substitute `chatgpt`, `chatgpt_ai`, `openai`
or any other string.

> You **return** your finished `QueryCapture` object to the orchestrator — you do **not**
> ingest it, **not** create runs, **not** write to the DB, and **not** start any server (so
> you are not given a `run_id` or DB path). The orchestrator owns all of that.

> **Locale knobs (target market ≠ UI language).** Unlike Google there are **no
> `hl`/`gl` URL params**. ChatGPT's answer language/market follows the **account &
> UI language** of the logged-in session (and, secondarily, the language you write
> the query in). Use the session **as configured for the market being tracked** and
> **read the page in whatever language it actually renders** — the labels below are
> shown in English with the **Russian** strings this session actually uses marked
> `RU:`. Do not assume English UI. The dashboard/report UI language (`--lang`) is a
> separate, downstream choice and does not affect capture.

---

## Procedure

> ### Tooling — how to actually read the answer (read this first)
> **Labels vary by locale; the structures are universal.** The **structures** — a
> streamed **answer block**, **inline citation chips**, and a **Sources panel** behind a
> "Sources" button — are the same in every locale. **Lead with the rendered text in the
> page's actual language.** English labels (with the Russian string this session uses,
> marked `RU:`):
> - web-search toggle / "search the web" chip **"Search"** (RU: "Поиск") and the
>   home-screen shortcut **"Search the web" / "Find something"** (RU: "Найди что-то")
> - **temporary chat** toggle **"Temporary chat"** (RU: "Временный чат") — top bar
> - end-of-answer **"Sources"** button → opens the sources panel (RU: "Источники")
> - **model selector** (RU: "Селектор модели")
>
> **Verified live against a real logged-in session (2026-06-22):**
> - **`get_page_text` WORKS for ChatGPT** — it returns the **full answer prose, any
>   table, and the inline citation labels** (each chip shows a source name + an optional
>   **"+N"** counter), in reading order. **This is the opposite of the Google playbook**
>   (where `get_page_text` drops the AI block). **Use `get_page_text` as your primary read**
>   for `answer_text_md`, for detecting whether the answer is grounded, and for the ordered
>   list of inline citation chips. A **screenshot** is a useful visual confirm but is not
>   required to read the prose.
> - **Collect source URLs → open the "Sources" (RU: "Источники") panel, then
>   `read_page(filter="interactive")`.** The panel lists **every** retrieved source as a
>   link card (favicon + site name + title + date) with a **real `href`**, e.g.
>   `https://www.spotsaas.com/blog/best-project-management-software/?utm_source=chatgpt.com`.
>   Panel display order = your `sources` rank order.
> - **Inline citation chips also expose real `href`s** in
>   `read_page(filter="interactive")` (e.g. a chip link
>   `https://www.reddit.com/r/...?utm_source=chatgpt.com`) — but `read_page` only surfaces
>   the chips currently near the viewport, so for the **complete ordered list of chips** lean
>   on `get_page_text` and resolve each chip's URL against the Sources panel (step 4).
> - **URLs are DIRECT publisher URLs** (no Google-style `/url?q=` redirect wrappers), with
>   a harmless **`?utm_source=chatgpt.com`** appended. `normalize_domain` strips the query
>   string and `www.`, so no unwrapping is needed — store the URL as-is.
> - **NEVER click a citation chip or a source card.** A chip/card is a **link that opens
>   the source site in a NEW TAB** (verified). Worse than Google: that new tab can be
>   **un-closable** via the browser tools (a "this site is blocked" guard), so a stray
>   click both navigates away *and* litters a tab you cannot clean up. **Every URL you need
>   is already on the ChatGPT page — read its `href` from the tree in place.** If a chip
>   click accidentally opens a tab, switch back to your ChatGPT tab and carry on reading in
>   place; do **not** visit, read, or "study" the source site.
> - **A correct capture is ~6–12 tool calls with ZERO navigation away from ChatGPT.**

### 1. Open ChatGPT, pin a clean grounded session, submit the query
- Use the connected logged-in Chrome. Get tab context (`tabs_context_mcp`) and work in
  **your own tab**; `navigate` to `https://chatgpt.com/`. The session must be **logged in**
  (a logged-out wall means stop — see Guardrails). Keep the account/locale **as configured
  for the market being tracked** — do not change the account or UI language.
- **Turn on Temporary chat** (RU: "Временный чат") from the top bar (URL becomes
  `https://chatgpt.com/?temporary-chat=true`). This is the right capture mode: it keeps the
  run out of the user's history, **disables memory/personalization** (more neutral,
  reproducible captures), and does not touch the user's other chats. (A copy may be retained
  ~30 days for safety — that is fine.) Never open, read, or reuse the user's existing chats.
- **Enable web search** so the answer is grounded: click the **"Search the web" / "Find
  something"** chip (RU: "Найди что-то") on the home screen, or toggle the composer's
  **globe → "Search"** (RU: "Поиск"). When search is armed a **"Search" pill** (RU: "Поиск")
  shows in the composer. Pin the **default model** + **Search ON**; do not switch models.
- Type the `query` **verbatim** into the composer and submit. **Wait for streaming to
  finish** — the answer streams in; wait until the **stop** button reverts to the idle
  **send** button and the standard disclaimer footer appears (RU: "ChatGPT может допускать
  ошибки…"). Read only the settled answer.

### 2. Detect whether a GROUNDED answer rendered → `overview_present`
This is the **denominator gate** for all visibility metrics — get it right. **ChatGPT
almost always answers, so a reply alone is NOT the gate.** The gate is **"the model ran a
web search and rendered a sourced answer"**: there is an end-of-answer **"Sources" button**
(RU: "Источники") **and/or** inline citation chips in the prose. Detect from `get_page_text`
(inline chip labels + a trailing "Sources"/"Источники") and confirm with a screenshot.

Three distinct states:

- **(a) Ungrounded answer — no web search / no sources.** ChatGPT answered from its own
  knowledge: **no "Sources" button and no inline citation chips** anywhere. This is a valid
  "not visible in search" data point, **not an error.** Set:
  - `overview_present = false`
  - `sources = []`, `citations = []`
  - `target_source_ranks = []`, `target_citation_ranks = []`
  - `answer_text_md = null`
  - `brand_in_answer_text = false`
  - `sentiment = null`
  - (Still fill `query`/`lens`/`engine`/`captured_at`; `screenshot_path` stays `null`.)
- **(b) Grounded answer, target ABSENT.** Sources/citations rendered, but the target
  domain/brand appears **nowhere** (not in prose, not in any source or citation). Set
  `overview_present = true`, fill `answer_text_md` + `sources` + `citations` as they
  rendered, but: rank arrays `= []`, `brand_in_answer_text = false`, **`sentiment = null`**.
- **(c) Grounded answer, target PRESENT.** As (b), but the target appears in prose and/or
  in links. Fill rank arrays, set `brand_in_answer_text` accordingly, and write a non-null
  `sentiment`.

> **Landmark hints (not selectors):** a grounded answer carries the inline source chips
> (name + optional "+N") and a trailing **"Sources"** control (RU: "Источники"). An answer
> with neither is ungrounded → state (a). Do **not** force a reroll hoping search fires —
> capture what rendered once (see Guardrails).

### 3. Extract `sources` — the full relied-on set (the "Sources" panel)
- `sources` is the answer's **relied-on / retrieved set** — and it **MUST include every
  domain you cite in step 4** (citations ⊆ sources; see the box after step 4).
- **Open the "Sources" panel** (RU: "Источники") at the end of the answer — `find` the
  "Sources"/"Источники" button and `left_click` it (it is a real **button**, not a source
  link). A side panel opens listing **every** retrieved source as a link card.
- **Collect via `read_page(filter="interactive")`.** Each card is a link with a real
  `href`. If the panel scrolls, scroll it and re-read until no new cards appear — capture the
  **complete** set, in **panel display order**.
- Record links in display order. **Duplicate domains are allowed** — keep every occurrence
  (e.g. Reddit can legitimately appear several times). Do **not** dedupe and do **not**
  reorder.
- For each, build a `Link`: `{ "rank": <1-based position>, "url": "<full URL>",
  "domain": "<normalize_domain(url)>" }`. `rank` starts at **1** and matches array
  position exactly.
- **Store the URL as rendered** (direct publisher URL incl. the `?utm_source=chatgpt.com`
  param). No redirect-unwrapping is needed; `normalize_domain` handles the query string and
  `www.`. **Never click a card to "get" a URL** — read its `href` in place.

### 4. Extract `citations` — the inline attached chips in the prose
- These are the **inline badges/chips** sitting next to statements in the answer prose — a
  favicon + a source name, e.g. **"Reddit"**, **"Spotsaas"**, or
  **"mysoftwarecompare.com (+1)"**. In `get_page_text` they appear inline as the source
  label plus an optional **"+N"** on its own line. Walk them **in reading order**.
- **A chip can hide multiple sources.** A chip carrying **"+N"** stands for the named source
  **plus N more**, all of which are in the Sources panel. **Do not click the chip to expand
  it** (clicking opens the source site in a possibly-unclosable tab). Instead, **resolve each
  chip to a URL by matching its label to the Sources panel** (by domain or site name) and
  read the chip's primary `href` from `read_page(filter="interactive")` when it is in view.
  Capturing the chip's primary (named) source is sufficient for target detection.
- Record one `Link` per chip occurrence, **in prose order** (top-to-bottom). **Duplicates
  allowed** — if the same source is cited at two places, list it twice. Same `Link` shape and
  same URL handling as step 3. `rank` is 1-based by position **within `citations`**
  (independent of `sources` ranks).

> **`citations` ⊆ `sources` — citations are a SUBSET of sources, not an independent
> channel.** `sources` is the answer's **relied-on / retrieved set**; `citations` are the
> inline chips marking which source backs a given sentence. The model can only cite what it
> retrieved, so **every cited domain is also a source** (in ChatGPT the Sources panel is the
> *union* of all inline chips, so this holds naturally). Therefore: **`sources` MUST INCLUDE
> every cited domain.** If a chip domain is somehow not already in `sources`, **add it to
> `sources`** so the invariant holds. Concretely: **any domain in `citations` MUST also
> appear in `sources`**, and a non-empty `target_citation_ranks` therefore implies a
> non-empty `target_source_ranks`. (The `QueryCapture` validator enforces this.)

### 5. Derive `domain` and match the TARGET
- Compute every `Link.domain` with **`normalize_domain`** semantics
  (`pipeline/schema.py`): strip scheme / userinfo / path / query / fragment / port and a
  leading `www.`, **lowercase**, keep the **registrable domain** (last two labels, e.g.
  `blog.example.com → example.com`; multi-part suffixes like `co.uk` preserved → three
  labels). The `?utm_source=chatgpt.com` query string is stripped automatically. Apply the
  **same** function to the given target `domain` so matching is consistent.
- A link **matches the target** iff its normalized `domain` **equals** the normalized target
  domain (exact string equality after normalization).

### 6. Compute `target_source_ranks` and `target_citation_ranks`
- `target_source_ranks` = **every** 1-based position in `sources` whose `domain` equals the
  target domain, in **ascending** order. A domain can appear more than once → list all
  (e.g. `[2, 4]`). `[]` if it never appears in `sources`.
- `target_citation_ranks` = the same, computed over `citations`. `[]` if absent.
- These are positions **within each respective list**, not global.
- **Consistency check (citations ⊆ sources):** if `target_citation_ranks` is non-empty, then
  `target_source_ranks` **must** be non-empty too (you cited the target, so it is also a
  source — fold it into `sources` per step 4 if needed). A cited target with empty
  `target_source_ranks` is a capture bug.

### 7. Set `brand_in_answer_text`
- `true` iff the **brand NAME** (the given `name`, case-insensitive; allow obvious
  transliterations / locale variants of the same name) appears **in the answer prose**.
- This is about the **name in text**, **independent of any link** — the brand can be named
  with no link (`true`), or linked but never named in prose (`false`). Judge the prose only.

### 8. Write `sentiment`
- **One short qualitative phrase**, describing **how the answer treats the target
  domain/brand** — e.g.
  `"recommended as a top pick for small teams, linked directly"`,
  `"mentioned neutrally among 6 options"`,
  `"named, but with a caveat about setup complexity"`
  (RU example: `"упомянут нейтрально среди 6 вариантов"`).
- Write it in the **tracked market's language** (the language the answer rendered in) so it
  reads naturally next to the answer prose.
- It is **free text**, **not** a number or label enum. It is **never** aggregated into a
  metric — report/dashboard read it verbatim per query.
- **`sentiment = null` IFF the target appeared nowhere** (not in prose, not in `sources`,
  not in `citations`). If it appeared **anywhere**, write a non-null phrase. (Equivalently:
  `sentiment` is non-null exactly in state (c).)

### 9. Screenshots are transient — do **not** persist; set `screenshot_path = null`
- You **may** take screenshots to visually confirm the answer, but v1 does **not** save them
  as artifacts (and unlike Google, `get_page_text` already reads the answer, so a screenshot
  is optional). Set **`screenshot_path = null`** in your object. Do **not** write any file
  under `data/screenshots/...`.

### 10. RETURN exactly ONE `QueryCapture` JSON object to the orchestrator
- Produce **a single JSON object** matching `pipeline/INTERFACES.md` §1 in shape (see the
  worked example below) and **return it to the orchestrator** — it collects all objects and
  ingests them. **Do NOT run `pipeline.ingest`, do NOT create runs, do NOT write to the
  DB.** You may **read** `pipeline/schema.py` to self-validate first.
- `captured_at` = **now in UTC, ISO-8601** (e.g. `"2026-06-22T20:15:30Z"`);
  `screenshot_path = null`.
- Double-check the §1.2 invariants before returning (ranks 1-based & ascending; empty arrays
  when `overview_present=false`; `sentiment` null-iff-absent; domains normalized; citations
  ⊆ sources).

---

## Guardrails & caveats

- **Login wall / rate-limit / anti-bot.** If ChatGPT shows a **login/signup wall**, a
  **"you've reached your limit" / usage-cap** notice (RU: "вы достигли лимита"), a
  Cloudflare/"verify you are human" challenge, or any interstitial: **STOP**. Do **not**
  attempt to solve it, log in, switch accounts, or retry in a loop. Leave the challenge
  **visible in the browser** and **surface it to the human** ("limit/CAPTCHA on `<query>` —
  please resolve it in the open Chrome window, then tell me to continue"). Resume only after
  the human clears it. Other workers keep going.
- **NEVER click a citation chip or source card.** They open the source site in a new tab
  that may be **un-closable** via the browser tools. Read every URL's `href` in place. If one
  opens by accident, switch back to your ChatGPT tab and continue — never read the source
  site.
- **Selectors drift — read semantically.** Everything above ("Sources"/"Источники" button,
  "Search"/"Поиск" pill, "+N" chips) is a **landmark hint**. Identify blocks by **meaning and
  rendered text**, not fixed CSS/XPath. **Labels are locale-dependent** — match on intent.
- **Determinism caveat.** The same query can return a different answer (or decide not to
  search) on repeat — ChatGPT is non-deterministic and may personalize. Temporary chat
  reduces this, but **capture what rendered right now.** Do not regenerate hoping for a
  "better" or "grounded" answer; one honest capture per invocation. The UTC `captured_at`
  timestamps exactly what you saw.
- **Absence is data, not failure.** An ungrounded answer → `overview_present=false` is a
  **valid, expected** result (it feeds the grounded-answer coverage metric). Never fabricate
  sources, citations, or sentiment to "fill in" a capture.
- **Stay in this engine / this query.** One object per `(query, lens)`. Don't branch into
  other queries, models, or engines. Don't touch the user's existing chats.

---

## Worked example

**Inputs:** `query = "best project management software for small teams"`, `lens = "general"`,
brand `name = "Example"`, target `domain = "https://www.example.com"` (→ normalizes to
`example.com`). Session: logged-in, Temporary chat, Search ON.

A grounded answer rendered. The Sources panel listed several review sites plus the target
twice; the prose cited the target inline once and named "Example". Resulting single object:

```json
{
  "query": "best project management software for small teams",
  "lens": "general",
  "engine": "chatgpt_search",
  "captured_at": "2026-06-22T20:15:30Z",
  "answer_text_md": "For a small team, the best tool is the one your team will actually keep updated. **Example** is frequently recommended for its clean task board and simple workflows...",
  "screenshot_path": null,
  "overview_present": true,
  "sources": [
    { "rank": 1, "url": "https://www.spotsaas.com/blog/best-project-management-software/?utm_source=chatgpt.com", "domain": "spotsaas.com" },
    { "rank": 2, "url": "https://example.com/product/team-plan?utm_source=chatgpt.com", "domain": "example.com" },
    { "rank": 3, "url": "https://www.reddit.com/r/SaaS/comments/abc123/best_pm_software/?utm_source=chatgpt.com", "domain": "reddit.com" },
    { "rank": 4, "url": "https://example.com/blog/how-to-choose?utm_source=chatgpt.com", "domain": "example.com" }
  ],
  "citations": [
    { "rank": 1, "url": "https://example.com/product/team-plan?utm_source=chatgpt.com", "domain": "example.com" }
  ],
  "target_source_ranks": [2, 4],
  "target_citation_ranks": [1],
  "brand_in_answer_text": true,
  "sentiment": "recommended among suitable options, named with a direct link to the product"
}
```

> Contrast the other two states for the **same** query shape:
> - **State (b), grounded but no target:** `overview_present: true`, `sources`/`citations`
>   filled with whatever rendered, but `target_source_ranks: []`, `target_citation_ranks: []`,
>   `brand_in_answer_text: false`, `sentiment: null`.
> - **State (a), ungrounded (no web search / no sources):** `overview_present: false`,
>   `answer_text_md: null`, `sources: []`, `citations: []`, both rank arrays `[]`,
>   `brand_in_answer_text: false`, `sentiment: null` (`screenshot_path` stays `null`).
