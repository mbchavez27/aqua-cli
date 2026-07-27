#!/usr/bin/env node
"use strict";

/**
 * aqua — a for-fun CLI that estimates the "water footprint" of your AI token usage.
 *
 * IMPORTANT: The numbers this tool produces are ILLUSTRATIVE, not measured.
 * Real water-per-token figures vary enormously by model size, data center
 * cooling design (evaporative vs closed-loop), region, and season, and are
 * not publicly disclosed with precision by any lab. This tool uses a single
 * round, made-up-for-clarity constant inspired by the general order of
 * magnitude discussed in public research on AI data center water use.
 * Treat every number here as "vibes," not a citation.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const sources = require("../lib/sources");
const visuals = require("../lib/visuals");

const HOME_DIR = path.join(os.homedir(), ".aqua-cli");
const HISTORY_FILE = path.join(HOME_DIR, "history.json");

// --- illustrative constants (NOT verified real-world figures) ---
const ML_PER_1K_TOKENS = 15; // "milliliters" per 1,000 tokens, illustrative only

// --- ANSI colors, no deps ---
const c = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};

function banner() {
  console.log(
    `${c.cyan}${c.bold}
   ▄▄▄       ▄████▄   █    ██  ▄▄▄
  ▒████▄    ▒██▀ ▀█   ██  ▓██▒▒████▄
  ▒██  ▀█▄  ▒▓█    ▄ ▓██  ▒██░▒██  ▀█▄
  ░██▄▄▄▄██ ▒▓▓▄ ▄██▒▓▓█  ░██░░██▄▄▄▄██
   ▓█   ▓██▒▒ ▓███▀ ░▒▒█████▓  ▓█   ▓██▒
${c.reset}${c.dim}  water footprint estimator, for fun · v0.1.0${c.reset}
`
  );
}

function estimateTokensFromText(text) {
  // classic rough heuristic: ~4 chars per token
  return Math.max(1, Math.round(text.length / 4));
}

function ensureHome() {
  if (!fs.existsSync(HOME_DIR)) fs.mkdirSync(HOME_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({ totalTokens: 0, totalMl: 0, runs: [] }, null, 2));
  }
}

function loadHistory() {
  ensureHome();
  return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
}

function saveHistory(hist) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(hist, null, 2));
}

async function report(tokens, { save = true, label = "", vessel = null } = {}) {
  const ml = (tokens / 1000) * ML_PER_1K_TOKENS;

  console.log(`${label ? c.dim + label + c.reset + "\n" : ""}${c.bold}Tokens:${c.reset} ${tokens.toLocaleString()}`);
  console.log(`${c.bold}Estimated water:${c.reset} ${ml.toFixed(1)} mL`);
  const containerUsed = await visuals.animateContainer(ml, { containerId: vessel });
  console.log(`${c.dim}(rendered as a ${containerUsed} — pass --vessel to force glass/bottle/bathtub/pool)${c.reset}`);
  console.log(`${c.dim}${visuals.pickComparisons(ml)}${c.reset}`);

  if (save) {
    const hist = loadHistory();
    hist.totalTokens += tokens;
    hist.totalMl += ml;
    hist.runs.push({ ts: new Date().toISOString(), tokens, ml });
    saveHistory(hist);
    console.log(
      `${c.green}saved${c.reset} — lifetime total: ${hist.totalTokens.toLocaleString()} tokens ≈ ${hist.totalMl.toFixed(1)} mL`
    );
  }
  console.log();
}

async function reportFromSources(mode) {
  const detected = sources.detectSources();
  const available = detected.filter((s) => s.available);

  if (available.length === 0) {
    console.log(
      `${c.yellow}no local usage logs found${c.reset} for Claude Code, Gemini CLI, or opencode.\n${c.dim}(checked ~/.claude/projects, ~/.gemini/tmp, ~/.local/share/opencode)${c.reset}\n`
    );
    return;
  }

  const getter = mode === "sync" ? sources.historicalTokensFor : sources.currentSessionTokensFor;
  let totalTokens = 0;
  const rows = [];

  for (const s of available) {
    const { tokens, files } = getter(s.id);
    totalTokens += tokens;
    rows.push({ label: s.label, tokens, files });
  }

  console.log(`${c.bold}Detected:${c.reset} ${available.map((s) => s.label).join(", ")}`);
  for (const row of rows) {
    console.log(
      `  ${c.dim}${row.label.padEnd(12)}${c.reset} ${row.tokens.toLocaleString().padStart(10)} tokens  ${c.dim}(${row.files} file${row.files === 1 ? "" : "s"})${c.reset}`
    );
  }
  console.log();

  if (totalTokens === 0) {
    console.log(`${c.dim}no token usage found in the detected logs yet${c.reset}\n`);
    return;
  }

  await report(totalTokens, {
    label: mode === "sync" ? "combined historical usage, all detected tools" : "combined current-session usage, all detected tools",
  });
}

function printHelp() {
  banner();
  console.log(`${c.bold}Usage${c.reset}
  aqua estimate --tokens <n>          estimate water for a raw token count
  aqua estimate --text "<string>"     estimate tokens (~4 chars/token) then water
  aqua estimate --file <path>         same, but reads the file
  aqua estimate ... --vessel <name>   force a specific container instead of auto-picking
                                       (glass / bottle / bathtub / pool)
  aqua stats                          show lifetime totals (from "estimate" runs)
  aqua reset                          clear saved history
  aqua auto                           auto-detect Claude Code / Gemini CLI / opencode,
                                       read tokens from each tool's CURRENT session
  aqua sync                           same, but sums ALL historical sessions ever logged

${c.bold}Visualization${c.reset}
  The container auto-scales with magnitude — small counts fill a glass,
  bigger ones a bottle, then a bathtub, then a pool — so the animation
  stays proportionate whether you're estimating one prompt or a whole
  project's history. Comparisons (teaspoons, cups, flushes, showers,
  bathtubs, pools...) are picked dynamically for the same reason.

${c.bold}Examples${c.reset}
  aqua estimate --tokens 12000
  aqua estimate --text "how do I center a div"
  aqua estimate --file ./chat-log.txt
  aqua estimate --tokens 500000 --vessel pool
  aqua auto
  aqua sync

${c.yellow}Note:${c.reset} numbers are illustrative, not measured. See comment at top of source.
${c.yellow}Note:${c.reset} auto/sync read Gemini CLI + opencode logs with best-effort parsing;
      those tools' on-disk formats are undocumented/beta and may change.
`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  if (cmd === "stats") {
    const hist = loadHistory();
    banner();
    if (hist.runs.length === 0) {
      console.log(`${c.dim}no runs yet — try: aqua estimate --tokens 1000${c.reset}\n`);
      return;
    }
    console.log(`${c.bold}Lifetime tokens:${c.reset} ${hist.totalTokens.toLocaleString()}`);
    console.log(`${c.bold}Lifetime water:${c.reset} ${hist.totalMl.toFixed(1)} mL`);
    const containerUsed = await visuals.animateContainer(hist.totalMl);
    console.log(`${c.dim}(rendered as a ${containerUsed})${c.reset}`);
    console.log(`${c.dim}${visuals.pickComparisons(hist.totalMl)} · ${hist.runs.length} run(s) logged${c.reset}\n`);
    return;
  }

  if (cmd === "auto" || cmd === "sync") {
    banner();
    await reportFromSources(cmd);
    return;
  }

  if (cmd === "reset") {
    ensureHome();
    saveHistory({ totalTokens: 0, totalMl: 0, runs: [] });
    console.log(`${c.green}history cleared${c.reset}`);
    return;
  }

  if (cmd === "estimate") {
    const tokensFlagIdx = args.indexOf("--tokens");
    const textFlagIdx = args.indexOf("--text");
    const fileFlagIdx = args.indexOf("--file");
    const vesselFlagIdx = args.indexOf("--vessel");

    let vessel = null;
    if (vesselFlagIdx !== -1) {
      vessel = args[vesselFlagIdx + 1];
      if (!visuals.CONTAINERS[vessel]) {
        console.error(`${c.yellow}unknown vessel "${vessel}" — choose from: ${Object.keys(visuals.CONTAINERS).join(", ")}${c.reset}`);
        process.exit(1);
      }
    }

    banner();

    if (tokensFlagIdx !== -1) {
      const n = parseInt(args[tokensFlagIdx + 1], 10);
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`${c.yellow}give a positive integer after --tokens${c.reset}`);
        process.exit(1);
      }
      await report(n, { vessel });
      return;
    }

    if (textFlagIdx !== -1) {
      const text = args[textFlagIdx + 1] || "";
      const tokens = estimateTokensFromText(text);
      await report(tokens, { label: `text: "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`, vessel });
      return;
    }

    if (fileFlagIdx !== -1) {
      const filePath = args[fileFlagIdx + 1];
      if (!filePath || !fs.existsSync(filePath)) {
        console.error(`${c.yellow}file not found: ${filePath}${c.reset}`);
        process.exit(1);
      }
      const text = fs.readFileSync(filePath, "utf8");
      const tokens = estimateTokensFromText(text);
      await report(tokens, { label: `file: ${filePath}`, vessel });
      return;
    }

    console.error(`${c.yellow}need one of --tokens, --text, or --file${c.reset}\nrun "aqua help" for usage`);
    process.exit(1);
  }

  console.error(`${c.yellow}unknown command: ${cmd}${c.reset}\nrun "aqua help" for usage`);
  process.exit(1);
}

main().catch((err) => {
  process.stdout.write("\x1b[?25h"); // ensure cursor is restored on error
  console.error(`${c.yellow}error:${c.reset}`, err.message);
  process.exit(1);
});
