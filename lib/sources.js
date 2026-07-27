"use strict";

/**
 * Local usage-log readers for Claude Code, Gemini CLI, opencode, and Codex CLI.
 *
 * Claude Code's JSONL transcript format (~/.claude/projects/**\/*.jsonl,
 * with a `message.usage` block of {input_tokens, output_tokens,
 * cache_creation_input_tokens, cache_read_input_tokens} on assistant
 * entries) is well-documented and stable.
 *
 * Gemini CLI (~/.gemini/tmp/<project_hash>/chats/*.json|*.jsonl) is
 * explicitly labeled "beta"/"experimental" by the community tools that
 * read it (e.g. ccusage), because Gemini doesn't publish a stable on-disk
 * schema. The parser does best-effort extraction using known field-name
 * shapes seen in the wild (e.g. Gemini/Google's {promptTokenCount,
 * candidatesTokenCount, totalTokenCount} usageMetadata shape) and degrades
 * to 0 rather than throwing if a file doesn't match.
 *
 * opencode (~/.local/share/opencode/opencode.db) stores session data in a
 * SQLite database with token usage in the `session` table columns
 * (tokens_input, tokens_output, tokens_reasoning, tokens_cache_read,
 * tokens_cache_write). Requires Node.js 22+ for the built-in node:sqlite
 * module.
 *
 * Codex CLI (~/.codex/sessions/**\/*.jsonl and archived_sessions/, or
 * $CODEX_HOME) writes `token_count` events with real usage data, but with
 * a quirk: each event is a CUMULATIVE total for the session, not a
 * per-turn delta, so it needs its own parser rather than the generic
 * summing one (see tokensFromCodexFile).
 *
 * Adding another tool: give it an entry in SOURCES with `dir`,
 * `isAvailable()`, `allFiles()`, and `tokensForFile()`. If its JSON shape
 * is a simple per-event {input, output} or {promptTokenCount, ...} style
 * block, `tokensFromGenericFile` + `extractTokensFromNode` will likely
 * already handle it — just add the field-name shape it uses.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

let nodeSqlite;
try {
  nodeSqlite = require("node:sqlite");
} catch {
  nodeSqlite = null;
}

// Approximate mL per 1,000 tokens — based on published research.
// Jegham et al. (2025) "How Hungry is AI?" — 30-model benchmark
// Elsworth et al. (2025) "Measuring Environmental Impact of AI at Google Scale"
// Li et al. (2023) "Making AI Less Thirsty" (UC Riverside)
// Vanderbilt (2026) token-level environmental model for GPT-4o
const MODEL_WATER_ML = {
  "gemini-2.0-flash": 0.5,
  "gemini-2.5-flash": 0.5,
  "gemini-2.5-pro": 1.5,
  "gemini-3-pro": 1.5,
  "gemini-3.1-pro": 1.5,
  "gpt-4.1-nano": 1.0,
  "gpt-4o-mini": 1.0,
  "gpt-4o": 3.6,
  "gpt-4.1": 3.6,
  "gpt-5": 3.6,
  "claude-3-5-haiku": 2.5,
  "claude-3-7-sonnet": 5.0,
  "claude-sonnet-4": 5.0,
  "claude-opus": 10.0,
  "deepseek-v3": 20.0,
  "deepseek-v4": 20.0,
  "deepseek-r1": 60.0,
  "o3": 60.0,
  "o4": 60.0,
};
const DEFAULT_ML_PER_1K = 15;

function waterMlPer1kForModel(modelId) {
  if (!modelId) return DEFAULT_ML_PER_1K;
  const lower = modelId.toLowerCase();
  for (const [pattern, ml] of Object.entries(MODEL_WATER_ML)) {
    if (lower.includes(pattern)) return ml;
  }
  return DEFAULT_ML_PER_1K;
}

function homeSub(...parts) {
  return path.join(os.homedir(), ...parts);
}

// Cross-platform data directory resolution.
// Checks env var override first, then platform-specific default.
function resolveDataDir(envName, unixParts, winSubdir) {
  if (process.env[envName]) return path.join(process.env[envName]);
  if (process.platform === "win32" && winSubdir) {
    // Check %LOCALAPPDATA% first, then fall back to home-relative
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const winPath = path.join(localAppData, winSubdir);
      if (fs.existsSync(winPath)) return winPath;
    }
  }
  return homeSub(...unixParts);
}

function safeReadDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function walkFiles(dir, matcher, out = []) {
  for (const entry of safeReadDir(dir)) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, matcher, out);
    } else if (matcher(entry.name)) {
      try {
        const stat = fs.statSync(full);
        out.push({ path: full, mtimeMs: stat.mtimeMs });
      } catch {
        // file may have vanished between readdir and stat; skip it
      }
    }
  }
  return out;
}

function readJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Generic best-effort token extractor for Gemini CLI / opencode style
// JSON blobs, whose exact shape is undocumented. Stops recursing into a
// node as soon as it recognizes a token-usage shape at that node, to
// avoid double-counting a breakdown's parent and children.
function extractTokensFromNode(node) {
  if (node === null || typeof node !== "object") return 0;

  if (Array.isArray(node)) {
    return node.reduce((sum, item) => sum + extractTokensFromNode(item), 0);
  }

  // opencode step-finish shape: { input, output, reasoning, cache: { read, write } }
  if (typeof node.input === "number" && typeof node.output === "number") {
    const reasoning = typeof node.reasoning === "number" ? node.reasoning : 0;
    const cacheRead = node.cache && typeof node.cache.read === "number" ? node.cache.read : 0;
    const cacheWrite = node.cache && typeof node.cache.write === "number" ? node.cache.write : 0;
    return node.input + node.output + reasoning + cacheRead + cacheWrite;
  }

  // Gemini/Google usageMetadata shape: promptTokenCount + candidatesTokenCount (+ thoughts)
  if (typeof node.promptTokenCount === "number" && typeof node.candidatesTokenCount === "number") {
    const thoughts = typeof node.thoughtsTokenCount === "number" ? node.thoughtsTokenCount : 0;
    return node.promptTokenCount + node.candidatesTokenCount + thoughts;
  }

  // fallback: a bare total, if that's all we can find at this node
  if (typeof node.totalTokenCount === "number") return node.totalTokenCount;
  if (typeof node.totalTokens === "number") return node.totalTokens;

  // otherwise recurse into children
  let sum = 0;
  for (const key of Object.keys(node)) {
    sum += extractTokensFromNode(node[key]);
  }
  return sum;
}

function tokensFromGenericFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return 0;
  }
  if (filePath.endsWith(".jsonl")) {
    let sum = 0;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = readJsonSafe(trimmed);
      if (parsed) sum += extractTokensFromNode(parsed);
    }
    return sum;
  }
  const parsed = readJsonSafe(text);
  return parsed ? extractTokensFromNode(parsed) : 0;
}

// Gemini CLI: extracts tokens per model from JSONL chat files.
// Gemini messages have type "gemini" with a `model` field and `tokens` object.
function tokensByModelFromGeminiFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return new Map();
  }
  const byModel = new Map();
  const processLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const entry = readJsonSafe(trimmed);
    if (!entry) return;
    // Gemini message records have type "gemini" with optional model and tokens
    if (entry.type === "gemini" && entry.tokens) {
      const model = entry.model || "unknown";
      const t = entry.tokens;
      const tokens = (t.input || 0) + (t.output || 0) + (t.cached || 0) + (t.thoughts || 0) + (t.tool || 0);
      if (tokens > 0) byModel.set(model, (byModel.get(model) || 0) + tokens);
      return;
    }
    // Fallback: extract tokens from any recognized shape, attributed to "unknown"
    const tokens = extractTokensFromNode(entry);
    if (tokens > 0) byModel.set("unknown", (byModel.get("unknown") || 0) + tokens);
  };
  if (filePath.endsWith(".jsonl")) {
    for (const line of text.split("\n")) processLine(line);
  } else {
    processLine(text);
  }
  return byModel;
}

// --- Claude Code: stable, documented JSONL transcript format ---
function tokensFromClaudeCodeFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return 0;
  }
  let sum = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = readJsonSafe(trimmed);
    if (!entry || entry.type !== "assistant") continue;
    const usage = entry.message && entry.message.usage;
    if (!usage) continue;
    sum +=
      (usage.input_tokens || 0) +
      (usage.output_tokens || 0) +
      (usage.cache_creation_input_tokens || 0) +
      (usage.cache_read_input_tokens || 0);
  }
  return sum;
}

// Claude Code: returns Map<model, tokens>
function tokensByModelFromClaudeCodeFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return new Map();
  }
  const byModel = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = readJsonSafe(trimmed);
    if (!entry || entry.type !== "assistant") continue;
    const msg = entry.message;
    const usage = msg && msg.usage;
    if (!usage) continue;
    const model = (msg.model || "unknown");
    const tokens =
      (usage.input_tokens || 0) +
      (usage.output_tokens || 0) +
      (usage.cache_creation_input_tokens || 0) +
      (usage.cache_read_input_tokens || 0);
    byModel.set(model, (byModel.get(model) || 0) + tokens);
  }
  return byModel;
}

// --- Codex CLI: JSONL rollout files, but with a quirk. Each `token_count`
// event reports the CUMULATIVE total for the session so far (confirmed by
// how the community tool ccusage parses it: it diffs consecutive totals to
// recover per-turn usage). That means we must NOT sum every event in the
// file — the last (largest) total_tokens value already IS the session
// total. We scan every line defensively (rather than assuming events are
// in order) and take the max total_tokens seen, which is robust either way.
function tokensFromCodexFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return 0;
  }

  let maxTotal = 0;

  function scanForTokenCount(node) {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) scanForTokenCount(item);
      return;
    }
    if (typeof node.total_tokens === "number") {
      if (node.total_tokens > maxTotal) maxTotal = node.total_tokens;
      return; // don't recurse further into a matched usage node
    }
    if (typeof node.input_tokens === "number" && typeof node.output_tokens === "number") {
      const reasoning = typeof node.reasoning_output_tokens === "number" ? node.reasoning_output_tokens : 0;
      const total = node.input_tokens + node.output_tokens + reasoning;
      if (total > maxTotal) maxTotal = total;
      return;
    }
    for (const key of Object.keys(node)) scanForTokenCount(node[key]);
  }

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = readJsonSafe(trimmed);
    if (parsed) scanForTokenCount(parsed);
  }

  return maxTotal;
}

// Codex CLI: returns Map<model, tokens>.
// Tracks model from turn_context records. Attributes the cumulative
// total_tokens to the most frequently used model in the session.
function tokensByModelFromCodexFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return new Map();
  }

  let maxTotal = 0;
  const turnCounts = new Map(); // model -> number of turns

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = readJsonSafe(trimmed);
    if (!entry) continue;

    if (entry.type === "turn_context" && entry.payload && entry.payload.model) {
      const model = entry.payload.model;
      turnCounts.set(model, (turnCounts.get(model) || 0) + 1);
    }

    if (entry.type === "token_count" && entry.payload) {
      const tt = entry.payload.total_tokens;
      if (typeof tt === "number" && tt > maxTotal) maxTotal = tt;
    }
  }

  if (maxTotal === 0) return new Map();

  // Attribute total to the most-used model
  let topModel = "unknown";
  let topCount = 0;
  for (const [model, count] of turnCounts) {
    if (count > topCount) { topModel = model; topCount = count; }
  }
  return new Map([[topModel, maxTotal]]);
}

const SOURCES = {
  "claude-code": {
    label: "Claude Code",
    dir: process.env.CLAUDE_CONFIG_DIR
      ? path.join(process.env.CLAUDE_CONFIG_DIR, "projects")
      : homeSub(".claude", "projects"),
    isAvailable() {
      return fs.existsSync(this.dir);
    },
    allFiles() {
      return walkFiles(this.dir, (name) => name.endsWith(".jsonl"));
    },
    tokensForFile: tokensFromClaudeCodeFile,
    getTokensByModel() {
      const files = this.allFiles();
      const agg = new Map();
      for (const f of files) {
        const perFile = tokensByModelFromClaudeCodeFile(f.path);
        for (const [model, tokens] of perFile) {
          agg.set(model, (agg.get(model) || 0) + tokens);
        }
      }
      return [...agg.entries()].map(([model, tokens]) => ({ model, tokens }));
    },
  },
  "gemini-cli": {
    label: "Gemini CLI",
    dir: process.env.GEMINI_DATA_DIR || process.env.GEMINI_CONFIG_DIR
      ? path.join(process.env.GEMINI_DATA_DIR || process.env.GEMINI_CONFIG_DIR, "tmp")
      : homeSub(".gemini", "tmp"),
    isAvailable() {
      return fs.existsSync(this.dir);
    },
    allFiles() {
      return walkFiles(this.dir, (name) => name.endsWith(".json") || name.endsWith(".jsonl")).filter((f) =>
        f.path.includes(`${path.sep}chats${path.sep}`)
      );
    },
    tokensForFile: tokensFromGenericFile,
    getTokensByModel() {
      const files = this.allFiles();
      const agg = new Map();
      for (const f of files) {
        const perFile = tokensByModelFromGeminiFile(f.path);
        for (const [model, tokens] of perFile) {
          agg.set(model, (agg.get(model) || 0) + tokens);
        }
      }
      return [...agg.entries()].map(([model, tokens]) => ({ model, tokens }));
    },
  },
  opencode: {
    label: "opencode",
    dir: resolveDataDir("OPENCODE_DATA_DIR", [".local", "share", "opencode"], "opencode"),
    isAvailable() {
      return fs.existsSync(path.join(this.dir, "opencode.db"));
    },
    allFiles() {
      return [];
    },
    tokensForFile: () => 0,
    getTokensFromDb() {
      if (!nodeSqlite) return { tokens: 0, files: 0 };
      const dbPath = path.join(this.dir, "opencode.db");
      try {
        const db = new nodeSqlite.DatabaseSync(dbPath, { open: true, readOnly: true });
        const row = db.prepare(
          "SELECT SUM(tokens_input) AS ti, SUM(tokens_output) AS tout, SUM(tokens_reasoning) AS tr, SUM(tokens_cache_read) AS tcr, SUM(tokens_cache_write) AS tcw FROM session"
        ).get();
        db.close();
        const tokens = (row.ti || 0) + (row.tout || 0) + (row.tr || 0) + (row.tcr || 0) + (row.tcw || 0);
        return { tokens, files: 1 };
      } catch {
        return { tokens: 0, files: 0 };
      }
    },
    getTokensByModel() {
      if (!nodeSqlite) return [];
      const dbPath = path.join(this.dir, "opencode.db");
      try {
        const db = new nodeSqlite.DatabaseSync(dbPath, { open: true, readOnly: true });
        const rows = db.prepare(
          `SELECT model,
                  SUM(tokens_input) AS ti, SUM(tokens_output) AS tout,
                  SUM(tokens_reasoning) AS tr, SUM(tokens_cache_read) AS tcr,
                  SUM(tokens_cache_write) AS tcw
           FROM session WHERE model IS NOT NULL
           GROUP BY model`
        ).all();
        // Also account for sessions with NULL model
        const nullRow = db.prepare(
          `SELECT SUM(tokens_input) AS ti, SUM(tokens_output) AS tout,
                  SUM(tokens_reasoning) AS tr, SUM(tokens_cache_read) AS tcr,
                  SUM(tokens_cache_write) AS tcw
           FROM session WHERE model IS NULL`
        ).get();
        db.close();
        const result = rows.map((r) => {
          let modelId = "unknown";
          try { modelId = JSON.parse(r.model).id || "unknown"; } catch {}
          const tokens = (r.ti || 0) + (r.tout || 0) + (r.tr || 0) + (r.tcr || 0) + (r.tcw || 0);
          return { model: modelId, tokens };
        });
        const nullTokens = (nullRow.ti || 0) + (nullRow.tout || 0) + (nullRow.tr || 0) + (nullRow.tcr || 0) + (nullRow.tcw || 0);
        if (nullTokens > 0) result.push({ model: "unknown (older sessions)", tokens: nullTokens });
        return result;
      } catch {
        return [];
      }
    },
  },
  codex: {
    label: "Codex CLI",
    dir: process.env.CODEX_HOME || homeSub(".codex"),
    isAvailable() {
      return fs.existsSync(path.join(this.dir, "sessions")) || fs.existsSync(path.join(this.dir, "archived_sessions"));
    },
    allFiles() {
      const out = [];
      walkFiles(path.join(this.dir, "sessions"), (name) => name.endsWith(".jsonl"), out);
      walkFiles(path.join(this.dir, "archived_sessions"), (name) => name.endsWith(".jsonl"), out);
      return out;
    },
    tokensForFile: tokensFromCodexFile,
    getTokensByModel() {
      const files = this.allFiles();
      const agg = new Map();
      for (const f of files) {
        const perFile = tokensByModelFromCodexFile(f.path);
        for (const [model, tokens] of perFile) {
          agg.set(model, (agg.get(model) || 0) + tokens);
        }
      }
      return [...agg.entries()].map(([model, tokens]) => ({ model, tokens }));
    },
  },
};

function detectSources() {
  return Object.entries(SOURCES).map(([id, src]) => ({
    id,
    label: src.label,
    dir: src.dir,
    available: src.isAvailable(),
  }));
}

// Sums tokens across every session file ever found for a source.
function historicalTokensFor(id) {
  const src = SOURCES[id];
  if (!src || !src.isAvailable()) return { tokens: 0, files: 0 };
  if (id === "opencode" && typeof src.getTokensFromDb === "function") {
    return src.getTokensFromDb();
  }
  const files = src.allFiles();
  let tokens = 0;
  for (const f of files) tokens += src.tokensForFile(f.path);
  return { tokens, files: files.length };
}

// Finds the single most-recently-modified session and sums just that one.
function currentSessionTokensFor(id) {
  const src = SOURCES[id];
  if (!src || !src.isAvailable()) return { tokens: 0, files: 0 };
  if (id === "opencode" && typeof src.getTokensFromDb === "function") {
    return src.getTokensFromDb();
  }
  const files = src.allFiles();
  if (files.length === 0) return { tokens: 0, files: 0 };
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { tokens: src.tokensForFile(files[0].path), files: 1 };
}

// Returns [{ model, tokens }] for all sessions of a source.
function historicalTokensByModel(id) {
  const src = SOURCES[id];
  if (!src || !src.isAvailable()) return [];
  if (typeof src.getTokensByModel === "function") return src.getTokensByModel();
  // Fallback: no model info available, attribute all to "unknown"
  const { tokens } = historicalTokensFor(id);
  return tokens > 0 ? [{ model: "unknown", tokens }] : [];
}

// Returns [{ model, tokens }] for the current session of a source.
function currentSessionTokensByModel(id) {
  const src = SOURCES[id];
  if (!src || !src.isAvailable()) return [];
  if (typeof src.getTokensByModel === "function") return src.getTokensByModel();
  const { tokens } = currentSessionTokensFor(id);
  return tokens > 0 ? [{ model: "unknown", tokens }] : [];
}

module.exports = {
  detectSources,
  historicalTokensFor,
  currentSessionTokensFor,
  historicalTokensByModel,
  currentSessionTokensByModel,
  SOURCE_IDS: Object.keys(SOURCES),
  MODEL_WATER_ML,
  DEFAULT_ML_PER_1K,
  waterMlPer1kForModel,
};
