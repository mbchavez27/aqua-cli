"use strict";

/**
 * Local usage-log readers for Claude Code, Gemini CLI, and opencode.
 *
 * Claude Code's JSONL transcript format (~/.claude/projects/**\/*.jsonl,
 * with a `message.usage` block of {input_tokens, output_tokens,
 * cache_creation_input_tokens, cache_read_input_tokens} on assistant
 * entries) is well-documented and stable.
 *
 * Gemini CLI (~/.gemini/tmp/<project_hash>/chats/*.json|*.jsonl) and
 * opencode (~/.local/share/opencode/storage/message/{sessionID}/msg_*.json)
 * are both explicitly labeled "beta"/"experimental" data sources even by
 * the community tools that read them (e.g. ccusage), because neither
 * project publishes a stable on-disk schema. The parsers below do
 * best-effort extraction using known field-name shapes seen in the wild
 * (e.g. opencode's {input, output, reasoning, cache:{read, write}} token
 * blocks; Gemini/Google's {promptTokenCount, candidatesTokenCount,
 * totalTokenCount} usageMetadata shape) and degrade to 0 rather than
 * throwing if a file doesn't match. Expect this to need updates if those
 * tools change their storage format.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

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
      return fs.existsSync(path.join(this.dir, "storage", "message"));
    },
    allFiles() {
      return walkFiles(path.join(this.dir, "storage", "message"), (name) => name.startsWith("msg_") && name.endsWith(".json"));
    },
    tokensForFile: tokensFromGenericFile,
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
  const files = src.allFiles();
  let tokens = 0;
  for (const f of files) tokens += src.tokensForFile(f.path);
  return { tokens, files: files.length };
}

// Finds the single most-recently-modified session and sums just that one.
// For opencode, "session" means all msg_*.json files sharing the same
// parent directory (sessionID) as the most-recently-modified message file.
function currentSessionTokensFor(id) {
  const src = SOURCES[id];
  if (!src || !src.isAvailable()) return { tokens: 0, files: 0 };
  const files = src.allFiles();
  if (files.length === 0) return { tokens: 0, files: 0 };
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (id === "opencode") {
    const sessionDir = path.dirname(files[0].path);
    const sessionFiles = files.filter((f) => path.dirname(f.path) === sessionDir);
    let tokens = 0;
    for (const f of sessionFiles) tokens += src.tokensForFile(f.path);
    return { tokens, files: sessionFiles.length };
  }

  return { tokens: src.tokensForFile(files[0].path), files: 1 };
}

module.exports = {
  detectSources,
  historicalTokensFor,
  currentSessionTokensFor,
  SOURCE_IDS: Object.keys(SOURCES),
};
