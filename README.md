# aqua-cli 💧

A tiny terminal toy that turns your AI token usage into a **water-footprint
visualization** — an animated blue bar filling up in your terminal, backed
by a real (if rough) number.

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

Estimated water: 180.0 mL  [███░░░░░░░░░░░░░░░░░░░░] 💧
≈ 0.360 bottles (500 mL) · ≈ 0.28% of an 8-min shower
```

## ⚠️ Read this before you take any number seriously

**This is illustrative, not measured.** aqua-cli uses one flat, made-up-for-clarity
constant (`15 mL per 1,000 tokens`) to turn a token count into a milliliter
figure. Real water-per-token costs for AI inference:

- vary enormously by model size, hardware, cooling design (evaporative vs.
  closed-loop), region, season, and even time of day,
- are not published with precision by any major AI lab,
- are the subject of real, ongoing, and legitimately contested research
  (see [Li et al., "Making AI Less Thirsty"](https://arxiv.org/abs/2304.03271)
  for one widely-cited estimate, and note that estimates from different
  researchers and companies disagree by a lot).

Treat every mL figure this tool prints as a **prop for a conversation**,
not a citation. If you want to cite a number, go read the actual papers —
this repo links a couple below and PRs adding more (with sources) are very
welcome.

## Why this exists

Terminal AI coding agents (Claude Code, Gemini CLI, opencode, and friends)
put token counts in front of you constantly, but token counts don't mean
anything intuitively — nobody has a felt sense of what "40,000 tokens"
costs. Water is something everyone has a felt sense of. This tool exists
to make that translation, badly but memorably, and hopefully get more
people curious enough to look at the real numbers.

## Install

No dependencies — plain Node.js (14+).

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

The single droplet bar is gone — every run now renders one of four
ASCII containers that **auto-scale with magnitude**, so a single prompt
and a whole project's history don't look the same size:

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
real token counts — no manual entry needed.

| Tool        | Reads from                                                          | Format stability      |
| ----------- | -------------------------------------------------------------------- | ---------------------- |
| Claude Code | `~/.claude/projects/**/*.jsonl`                                      | documented, stable      |
| Gemini CLI  | `~/.gemini/tmp/*/chats/*.json` \| `*.jsonl` (or `$GEMINI_DATA_DIR`)  | **beta/undocumented**  |
| opencode    | `~/.local/share/opencode/storage/message/**/msg_*.json` (or `$OPENCODE_DATA_DIR`) | **beta/undocumented** |

A tool is only included if aqua finds its directory on disk — nothing is
assumed or required. `aqua auto` reads just the most-recently-modified
session per tool; `aqua sync` walks every session file it can find.

Claude Code's transcript format is documented and stable. Gemini CLI's and
opencode's are not officially published, and are labeled experimental even
by the third-party tools that already parse them. aqua's parser for those
two does best-effort field matching and returns `0` instead of crashing on
an unrecognized shape — but the numbers may drift if either tool changes
its on-disk format in a future release. If that happens on your machine,
please open an issue with a redacted sample of the file that broke it.

## How it works

- Tokens → mL: `tokens / 1000 * 15` (see the giant warning above)
- Every `estimate` run appends to `~/.aqua-cli/history.json`, so `aqua stats`
  shows a running lifetime total.
- `auto` / `sync` print a live per-tool breakdown each time you run them;
  they don't currently write into that same history file.

## Contributing

PRs welcome, especially:

- A better-sourced constant than the current flat 15 mL/1k tokens, ideally
  with a range instead of a single number, and a linked source.
- Fixes to the Gemini CLI / opencode parsers in `lib/sources.js` if their
  storage formats change.
- Support for other CLI agents' local logs (Codex, Amp, etc. all seem to
  write similar JSONL transcripts).

Please don't submit a PR that reports a number *more precisely* than the
underlying research supports — the goal is honest imprecision, not fake
precision.

## License

MIT — see [LICENSE](./LICENSE).
