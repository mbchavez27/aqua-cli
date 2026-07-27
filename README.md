# aqua-cli 💧

A tiny terminal toy that turns your AI token usage into a **water-footprint
visualization** — an animated blue bar filling up in your terminal, backed
by real (if approximate) per-model estimates from published research.

It's built to be a fun, low-stakes way into a conversation that's usually
anything but fun: AI data centers use real water for cooling, the exact
numbers are contested and mostly undisclosed, and "how much" is genuinely
hard to answer. This tool doesn't pretend to solve that. It gives you
*something concrete to look at* — a bar filling up as your token count
grows — as a prompt to go read the real research, not a replacement for it.

```
   ▄▄▄       ▄████▄   █    ██  ▄▄▄
  ▒████▄    ▒██▀ ▀█   ██  ▓██▒▒████▄
  ▒██  ▀█▄  ▒▓█    ▄ ▓██  ▒██░▒██  ▀█▄
  ░██▄▄▄▄██ ▒▓▓▄ ▄██▒▓▓█  ░██░░██▄▄▄▄██
   ▓█   ▓██▒▒ ▓███▀ ░▒▒█████▓  ▓█   ▓██▒
  water footprint estimator, for fun · v0.1.0

  Model                           Tokens    Water (est.)
  gemini-2.5-pro              1,200,000     1,800.0 mL
  deepseek-v4-flash-free        800,000    16,000.0 mL
  ────────────────────────────────────────────────────
  Estimated water: 17,800.0 mL
  ≈ 37 bathtubs · ≈ 27.67% of a backyard pool
```

## ⚠️ Read this before you take any number seriously

**These are approximations, not measurements.** aqua-cli uses per-model
water estimates derived from published research papers. Real water-per-token
costs for AI inference:

- vary enormously by model size, hardware, cooling design (evaporative vs.
  closed-loop), region, season, and even time of day,
- are not published with precision by any major AI lab,
- are the subject of real, ongoing, and legitimately contested research
  (see sources below).

Treat every mL figure this tool prints as a **prop for a conversation**,
not a citation. If you want to cite a number, go read the actual papers —
this repo links them below and PRs adding more (with sources) are very
welcome.

## Per-model water estimates

| Model family | mL per 1,000 tokens | Source |
|---|---|---|
| Gemini (2.0-flash, 2.5-flash) | ~0.5 | Elsworth et al. 2025 — Google production measurements |
| Gemini (2.5-pro, 3-pro, 3.1-pro) | ~1.5 | Elsworth et al. 2025 |
| GPT-4.1-nano, GPT-4o-mini | ~1.0 | Jegham et al. 2025 — 30-model benchmark |
| GPT-4o, GPT-4.1, GPT-5 | ~3.6 | Vanderbilt 2026 / OpenAI annual disclosure |
| Claude 3.5 Haiku | ~2.5 | Jegham et al. 2025 — AWS infrastructure (low WUE) |
| Claude 3.7 Sonnet, Claude Sonnet 4 | ~5.0 | Jegham et al. 2025 |
| Claude Opus | ~10.0 | Larger model estimate |
| DeepSeek-V3, DeepSeek-V4 | ~20.0 | Jegham et al. 2025 — higher PUE infrastructure |
| DeepSeek-R1, o3, o4 (reasoning) | ~60.0 | Jegham et al. 2025 — extended chain-of-thought |
| Unknown / unrecognized models | ~15.0 | Default fallback |

Real values vary by data center, cooling technology, region, and season.
These are illustrative — not precise measurements.

### Research sources

- **Jegham et al. (2025)** — ["How Hungry is AI? Benchmarking Energy, Water, and Carbon Footprint of LLM Inference"](https://arxiv.org/abs/2505.09598) — 30-model benchmark across OpenAI, Anthropic, Meta, DeepSeek
- **Elsworth et al. (2025)** — ["Measuring the Environmental Impact of Delivering AI at Google Scale"](https://arxiv.org/abs/2508.15734) — Google's own production-measured Gemini data
- **Li et al. (2023)** — ["Making AI Less Thirsty"](https://arxiv.org/abs/2304.03271) — UC Riverside, foundational water footprint methodology
- **Vanderbilt (2026)** — Token-level environmental model for GPT-4o

## Why this exists

Terminal AI coding agents (Claude Code, Gemini CLI, opencode, and friends)
put token counts in front of you constantly, but token counts don't mean
anything intuitively — nobody has a felt sense of what "40,000 tokens"
costs. Water is something everyone has a felt sense of. This tool exists
to make that translation, badly but memorably, and hopefully get more
people curious enough to look at the real numbers.

## Install

No dependencies — plain Node.js (22+ for `auto`/`sync` SQLite support; 14+ for `estimate`).

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/aqua-cli.git
cd aqua-cli
npm link          # installs `aqua` globally on your PATH
```

Or run it without installing:

```bash
node bin/aqua.js help
```

## Usage

```bash
aqua estimate --tokens 12000        # estimate from a raw token count
aqua estimate --text "hello there"  # estimate tokens (~4 chars/token), then water
aqua estimate --file ./chat.txt     # same, but reads a file
aqua stats                          # lifetime totals (saved in ~/.aqua-cli/history.json)
aqua reset                          # clear saved history

aqua auto                           # auto-detect Claude Code / Gemini CLI / opencode,
                                     # sum tokens from each tool's CURRENT session
aqua sync                           # same, but sums ALL historical sessions ever logged
```

`estimate` runs an animated fill in real terminals; it falls back to a
static render when output isn't a TTY (e.g. piped into a file or CI logs).

## Visualization

Every run renders one of four ASCII containers that **auto-scale with
magnitude**, so a single prompt and a whole project's history don't look
the same size:

| Container | Kicks in around... | Visual scale reference |
| --------- | ------------------- | ----------------------- |
| glass 🥛  | a few mL             | ~300 mL to fill |
| bottle 🍾 | hundreds of mL        | ~4 L to fill |
| bathtub 🛁 | tens of thousands of mL | ~150 L to fill |
| pool 🏊   | millions of mL         | ~8,000 L to fill |

Force a specific one instead of auto-picking:

```bash
aqua estimate --tokens 500000 --vessel pool
```

Alongside the container, every run prints **two dynamically-picked
comparisons** bracketing the actual number — small counts get teaspoons
and tablespoons, mid-range counts get toilet flushes and dishwasher
loads, huge counts get bathtubs and Olympic pools — instead of always
forcing everything into "fractions of a bottle," which stopped being
meaningful past a few hundred tokens.

## Automatic mode (`auto` / `sync`)

`aqua auto` / `aqua sync` scan your machine for local session logs and sum
real token counts — no manual entry needed. When model information is
available, a **per-model breakdown** is displayed with model-specific
water estimates.

| Tool        | Reads from                                                          | Model info | Format stability |
| ----------- | ------------------------------------------------------------------- | ---------- | ---------------- |
| Claude Code | `~/.claude/projects/**/*.jsonl`                                     | `message.model` on assistant entries | documented, stable |
| Codex CLI   | `~/.codex/sessions/**/*.jsonl` + `archived_sessions/` (or `$CODEX_HOME`) | `payload.model` on turn_context records | documented, evolving |
| Gemini CLI  | `~/.gemini/tmp/*/chats/*.json` \| `*.jsonl` (or `$GEMINI_DATA_DIR`) | `model` field on gemini-type messages | **beta/undocumented** |
| opencode    | `~/.local/share/opencode/opencode.db` (or `$OPENCODE_DATA_DIR`) | `session.model` column (JSON) | SQLite database |

A tool is only included if aqua finds its directory on disk — nothing is
assumed or required. `aqua auto` reads just the most-recently-modified
session per tool; `aqua sync` walks every session file it can find.

### Format notes

- **Claude Code:** Documented and stable. Model is at `entry.message.model`
  on every `type: "assistant"` line (e.g. `claude-sonnet-4-6`,
  `claude-opus-4-5-20251101`).

- **Codex CLI:** Documented, but has a quirk — `token_count` events report
  a *cumulative running total* for the whole session, not a per-turn delta.
  aqua takes the max cumulative value per session file instead of summing
  every event. Model is at `payload.model` on `turn_context` records.

- **Gemini CLI:** Not officially published. Model is at the `model` field
  on `type: "gemini"` message records. aqua does best-effort field matching
  and returns `0` instead of crashing on unrecognized shapes.

- **opencode:** Stores everything in a SQLite database. Token usage is in
  the `session` table columns (`tokens_input`, `tokens_output`,
  `tokens_reasoning`, `tokens_cache_read`, `tokens_cache_write`). Model is
  stored as a JSON string in the `model` column. Requires Node.js 22+ for
  the built-in `node:sqlite` module. Some older sessions may have `NULL`
  model info.

If any of this breaks on your machine, please open an issue with a
redacted sample of the file that broke it.

**Adding another tool:** most coding agent CLIs write similar JSONL
transcripts with a usage/token block somewhere in each turn. Look at
`lib/sources.js` — add an entry to `SOURCES` with `dir`, `isAvailable()`,
`allFiles()`, `tokensForFile()`, and optionally `getTokensByModel()`. If
the tool's usage shape is a simple `{input, output, ...}`-style object,
the existing generic parser (`tokensFromGenericFile` + `extractTokensFromNode`)
will likely already recognize it once you add its field names. PRs for
other tools (Cursor CLI, Aider, Amp, etc.) welcome.

## How it works

- **Per-model estimation:** `tokens / 1000 * mlPer1k` where `mlPer1k` is
  looked up from the model name via the `MODEL_WATER_ML` mapping in
  `lib/sources.js`. Unknown models fall back to 15 mL/1K tokens.
- Every `estimate` run appends to `~/.aqua-cli/history.json`, so `aqua stats`
  shows a running lifetime total.
- `auto` / `sync` print a live per-model breakdown each time you run them;
  they also write into the history file for lifetime tracking.

## Contributing

PRs welcome, especially:

- Better-sourced per-model water estimates, ideally with a range and a
  linked source. See `MODEL_WATER_ML` in `lib/sources.js`.
- Fixes to the Gemini CLI / opencode parsers if their storage formats change.
- Support for other CLI agents' local logs (Cursor, Amp, etc. all seem to
  write similar JSONL transcripts).

Please don't submit a PR that reports a number *more precisely* than the
underlying research supports — the goal is honest imprecision, not fake
precision.

## License

MIT — see [LICENSE](./LICENSE).
