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

function homeSub(...parts) {
  return path.join(os.homedir(), ...parts);
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

const SOURCES = {
  "claude-code": {
    label: "Claude Code",
    dir: homeSub(".claude", "projects"),
    isAvailable() {
      return fs.existsSync(this.dir);
    },
    allFiles() {
      return walkFiles(this.dir, (name) => name.endsWith(".jsonl"));
    },
    tokensForFile: tokensFromClaudeCodeFile,
  },
  "gemini-cli": {
    label: "Gemini CLI",
    dir: process.env.GEMINI_DATA_DIR || homeSub(".gemini", "tmp"),
    isAvailable() {
      return fs.existsSync(this.dir);
    },
    allFiles() {
      return walkFiles(this.dir, (name) => name.endsWith(".json") || name.endsWith(".jsonl")).filter((f) =>
        f.path.includes(`${path.sep}chats${path.sep}`)
      );
    },
    tokensForFile: tokensFromGenericFile,
  },
  opencode: {
    label: "opencode",
    dir: process.env.OPENCODE_DATA_DIR || homeSub(".local", "share", "opencode"),
    isAvailable() {
      return fs.existsSync(path.join(this.dir, "opencode.db"));
    },
    allFiles() {
      return [];
    },
    tokensForFile: () => 0,
    // opencode stores all data in a SQLite database; sum tokens directly.
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
    // NOTE: unlike the other sources, one Codex file = one session, and
    // its "total" already IS the session total (see tokensFromCodexFile).
    tokensForFile: tokensFromCodexFile,
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

module.exports = {
  detectSources,
  historicalTokensFor,
  currentSessionTokensFor,
  SOURCE_IDS: Object.keys(SOURCES),
};
