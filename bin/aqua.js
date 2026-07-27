#!/usr/bin/env node
"use strict";

/**
 * aqua — a for-fun CLI that estimates the "water footprint" of your AI token usage.
 *
 * IMPORTANT: The numbers this tool produces are APPROXIMATIONS, not measured.
 * Per-model water estimates (mL per 1,000 tokens) are derived from published
 * research papers (see help text for citations). Real water-per-token figures
 * vary enormously by model size, data center cooling design, region, and
 * season. Treat every number here as "illustrative," not a citation.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const sources = require("../lib/sources");
const visuals = require("../lib/visuals");

// Enable Windows VT processing for ANSI escape codes (Windows 10+)
if (process.platform === "win32" && process.stdout.isTTY) {
  try {
    require("child_process").execSync(
      'powershell -NoProfile -Command "' +
        "Add-Type '[DllImport(\"kernel32.dll\")] public static extern IntPtr GetStdHandle(int n); " +
        "[DllImport(\"kernel32.dll\")] public static extern bool GetConsoleMode(IntPtr h, out uint m); " +
        "[DllImport(\"kernel32.dll\")] public static extern bool SetConsoleMode(IntPtr h, uint m);'; " +
        "$h=[IntPtr]::Zero; $m=[uint32]0; " +
        "$h=[Win32]::GetStdHandle(-11); " +
        "if([Win32]::GetConsoleMode($h,[ref]$m)){[Win32]::SetConsoleMode($h,$m -bor 4)}\"",
      { stdio: "ignore", windowsHide: true }
    );
  } catch {}
}

const HOME_DIR = path.join(os.homedir(), ".aqua-cli");
const HISTORY_FILE = path.join(HOME_DIR, "history.json");

// --- illustrative constants (NOT verified real-world figures) ---
const ML_PER_1K_TOKENS = 15; // "milliliters" per 1,000 tokens, illustrative only (used by estimate command)

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

async function report(tokens, { save = true, label = "", vessel = null, modelBreakdown = null } = {}) {
  const ml = (tokens / 1000) * ML_PER_1K_TOKENS;

  console.log(`${label ? c.dim + label + c.reset + "\n" : ""}${c.bold}📊 Tokens:${c.reset} ${tokens.toLocaleString()}`);

  // Per-model breakdown table with box-drawing characters
  if (modelBreakdown && modelBreakdown.length > 0) {
    const maxModelLen = Math.max(...modelBreakdown.map((r) => r.model.length), 12);
    const numWidth = Math.max(12, String(Math.max(...modelBreakdown.map((r) => r.tokens))).length + 1);
    const totalMl = modelBreakdown.reduce((sum, r) => sum + (r.tokens / 1000) * r.mlPer1k, 0);
    const totalTokens = modelBreakdown.reduce((sum, r) => sum + r.tokens, 0);
    const w = maxModelLen + numWidth + 18;
    const sep = "─".repeat(w);

    console.log(`  ${c.cyan}┌${sep}┐${c.reset}`);
    console.log(`  ${c.cyan}│${c.reset}  ${c.dim}${"Model".padEnd(maxModelLen)}  ${"Tokens".padStart(numWidth)}  ${"Water (est.)".padStart(12)}  ${c.cyan}│${c.reset}`);
    console.log(`  ${c.cyan}├${sep}┤${c.reset}`);
    for (const row of modelBreakdown) {
      const rowMl = (row.tokens / 1000) * row.mlPer1k;
      console.log(
        `  ${c.cyan}│${c.reset}  ${row.model.padEnd(maxModelLen)}  ${row.tokens.toLocaleString().padStart(numWidth)}  ${rowMl.toFixed(1).padStart(8)} mL  ${c.cyan}│${c.reset}`
      );
    }
    console.log(`  ${c.cyan}├${sep}┤${c.reset}`);
    console.log(
      `  ${c.cyan}│${c.reset}  ${c.bold}${"Total".padEnd(maxModelLen)}  ${totalTokens.toLocaleString().padStart(numWidth)}  ${totalMl.toFixed(1).padStart(8)} mL  ${c.cyan}│${c.reset}`
    );
    console.log(`  ${c.cyan}└${sep}┘${c.reset}`);
  }

  console.log(`${c.bold}💧 Estimated water:${c.reset} ${ml.toFixed(1)} mL`);
  const containerUsed = await visuals.animateContainer(ml, { containerId: vessel });
  console.log(`${c.dim}(rendered as a ${containerUsed} 🌊 — pass --vessel to force glass/bottle/bathtub/pool)${c.reset}`);
  console.log(`${c.dim}${visuals.pickComparisons(ml)}${c.reset}`);

  if (save) {
    const hist = loadHistory();
    hist.totalTokens += tokens;
    hist.totalMl += ml;
    hist.runs.push({ ts: new Date().toISOString(), tokens, ml });
    saveHistory(hist);
    console.log(
      `${c.green}✅ saved${c.reset} — lifetime total: ${hist.totalTokens.toLocaleString()} tokens ≈ ${hist.totalMl.toFixed(1)} mL`
    );
  }
  console.log();
}

async function reportFromSources(mode) {
  const detected = sources.detectSources();
  const available = detected.filter((s) => s.available);

  if (available.length === 0) {
    console.log(
      `${c.yellow}🔍 no local usage logs found${c.reset} for Claude Code, Codex CLI, Gemini CLI, or opencode.\n${c.dim}(checked ~/.claude/projects, ~/.codex, ~/.gemini/tmp, ~/.local/share/opencode/opencode.db)${c.reset}\n`
    );
    return;
  }

  const byModelGetter = mode === "sync" ? sources.historicalTokensByModel : sources.currentSessionTokensByModel;
  const totalGetter = mode === "sync" ? sources.historicalTokensFor : sources.currentSessionTokensFor;

  let totalTokens = 0;
  const allModels = new Map();
  const sourceRows = [];

  for (const s of available) {
    const { tokens, files } = totalGetter(s.id);
    totalTokens += tokens;
    sourceRows.push({ label: s.label, tokens, files });

    const modelData = byModelGetter(s.id);
    for (const row of modelData) {
      const mlPer1k = sources.waterMlPer1kForModel(row.model);
      const existing = allModels.get(row.model);
      if (existing) {
        existing.tokens += row.tokens;
      } else {
        allModels.set(row.model, { tokens: row.tokens, mlPer1k });
      }
    }
  }

  console.log(`${c.bold}🔎 Detected:${c.reset} ${available.map((s) => "🌊 " + s.label).join("  ")}`);
  for (const row of sourceRows) {
    console.log(
      `  ${c.dim}${row.label.padEnd(12)}${c.reset} ${row.tokens.toLocaleString().padStart(10)} tokens  ${c.dim}(${row.files} file${row.files === 1 ? "" : "s"})${c.reset}`
    );
  }
  console.log();

  if (totalTokens === 0) {
    console.log(`${c.dim}no token usage found in the detected logs yet${c.reset}\n`);
    return;
  }

  const modelBreakdown = [...allModels.entries()]
    .map(([model, data]) => ({ model, tokens: data.tokens, mlPer1k: data.mlPer1k }))
    .sort((a, b) => b.tokens - a.tokens);

  await report(totalTokens, {
    label: mode === "sync" ? "combined historical usage, all detected tools 📊" : "combined current-session usage, all detected tools 📊",
    modelBreakdown,
  });
}

function exportCmd(args) {
  const modeIdx = args.indexOf("--mode");
  const mode = modeIdx !== -1 ? args[modeIdx + 1] : "sync";
  if (mode !== "sync" && mode !== "auto") {
    console.error(`${c.yellow}--mode must be "sync" or "auto"${c.reset}`);
    process.exit(1);
  }

  const oIdx = args.indexOf("-o");
  const outFile = oIdx !== -1 ? args[oIdx + 1] : "aqua-export.json";

  const detected = sources.detectSources();
  const available = detected.filter((s) => s.available);

  if (available.length === 0) {
    console.error(`${c.yellow}no local usage logs found${c.reset}`);
    process.exit(1);
  }

  const byModelGetter = mode === "sync" ? sources.historicalTokensByModel : sources.currentSessionTokensByModel;
  const totalGetter = mode === "sync" ? sources.historicalTokensFor : sources.currentSessionTokensFor;

  let totalTokens = 0;
  const allModels = new Map();
  const sourceRows = [];

  for (const s of available) {
    const { tokens, files } = totalGetter(s.id);
    totalTokens += tokens;
    sourceRows.push({ id: s.id, label: s.label, tokens, files });

    const modelData = byModelGetter(s.id);
    for (const row of modelData) {
      const mlPer1k = sources.waterMlPer1kForModel(row.model);
      const existing = allModels.get(row.model);
      if (existing) {
        existing.tokens += row.tokens;
      } else {
        allModels.set(row.model, { tokens: row.tokens, mlPer1k });
      }
    }
  }

  const modelBreakdown = [...allModels.entries()]
    .map(([model, data]) => ({ model, tokens: data.tokens, mlPer1k: data.mlPer1k }))
    .sort((a, b) => b.tokens - a.tokens);

  const totalMl = modelBreakdown.reduce((sum, r) => sum + (r.tokens / 1000) * r.mlPer1k, 0);

  const hist = loadHistory();

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    mode,
    totalTokens,
    totalMl,
    sources: sourceRows,
    modelBreakdown,
    history: {
      totalTokens: hist.totalTokens,
      totalMl: hist.totalMl,
      runCount: hist.runs.length,
    },
  };

  const json = JSON.stringify(data, null, 2);

  fs.writeFileSync(outFile, json + "\n");
  console.log(`${c.green}✅ exported${c.reset} → ${outFile}  (${totalTokens.toLocaleString()} tokens, ${modelBreakdown.length} models)`);
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
  aqua auto                           auto-detect Claude Code / Codex CLI / Gemini CLI / opencode,
                                       read tokens from each tool's CURRENT session
  aqua sync                           same, but sums ALL historical sessions ever logged
  aqua export [--mode sync|auto] [-o file.json]
                                     export token data as JSON (default: aqua-export.json)

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
  aqua export -o data.json

${c.bold}Water estimates${c.reset}
  Per-model water estimates (mL per 1,000 tokens) are approximate ranges
  derived from published research:

  Gemini ........... ~0.5–1.5 mL  (Elsworth et al. 2025, Google measured)
  GPT-4o ........... ~3.6 mL      (Vanderbilt 2026, OpenAI disclosure)
  Claude ........... ~2.5–5.0 mL  (Jegham et al. 2025, AWS infrastructure)
  DeepSeek ......... ~20–60 mL    (Jegham et al. 2025, higher PUE)
  Reasoning (o3) ... ~60 mL       (Jegham et al. 2025, extended CoT)

  Real values vary by data center, cooling technology, region, and season.
  These are illustrative — not precise measurements.

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
    console.log(`${c.bold}📊 Lifetime tokens:${c.reset} ${hist.totalTokens.toLocaleString()}`);
    console.log(`${c.bold}💧 Lifetime water:${c.reset} ${hist.totalMl.toFixed(1)} mL`);
    const containerUsed = await visuals.animateContainer(hist.totalMl);
    console.log(`${c.dim}(rendered as a ${containerUsed} 🌊)${c.reset}`);
    console.log(`${c.dim}${visuals.pickComparisons(hist.totalMl)} · ${hist.runs.length} run(s) logged${c.reset}\n`);
    return;
  }

  if (cmd === "export") {
    exportCmd(args.slice(1));
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
    console.log(`${c.green}✅ history cleared${c.reset}`);
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
  if (process.stdout.isTTY) process.stdout.write("\x1b[?25h");
  console.error(`${c.yellow}error:${c.reset}`, err.message);
  process.exit(1);
});
