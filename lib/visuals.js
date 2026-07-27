"use strict";

/**
 * Visualization layer: turns a milliliter figure into
 *   (a) an animated ASCII container with water gradients and wave effects,
 *   (b) dynamically-picked, relatable real-world comparisons with emojis.
 *
 * Everything here is illustrative — see the big warning in bin/aqua.js.
 * The container "capacities" below are chosen to make the animation feel
 * good across a wide range of token counts, not because a water bottle
 * literally holds that number of milliliters in this tool's model.
 */

const c = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  // Water depth gradient (dark at bottom → light at surface)
  waterDeep: "\x1b[38;5;21m",
  waterMid: "\x1b[38;5;27m",
  waterSurface: "\x1b[38;5;45m",
  waterShine: "\x1b[38;5;87m",
};

// --- real-world reference points, ascending by mL, with emojis ---
const COMPARISONS = [
  { ml: 5,       singular: "teaspoon of water",        plural: "teaspoons of water",        emoji: "🥄" },
  { ml: 15,      singular: "tablespoon of water",      plural: "tablespoons of water",      emoji: "🥄" },
  { ml: 75,      singular: "shot of espresso",         plural: "shots of espresso",         emoji: "☕" },
  { ml: 240,     singular: "cup of coffee",            plural: "cups of coffee",            emoji: "☕" },
  { ml: 350,     singular: "can of soda",              plural: "cans of soda",              emoji: "🥤" },
  { ml: 500,     singular: "water bottle",             plural: "water bottles",             emoji: "🍶" },
  { ml: 1000,    singular: "large water bottle (1L)",  plural: "large water bottles (1L)",  emoji: "🫗" },
  { ml: 3000,    singular: "bucket of water",          plural: "buckets of water",          emoji: "🪣" },
  { ml: 6000,    singular: "toilet flush",             plural: "toilet flushes",            emoji: "🚽" },
  { ml: 8000,    singular: "garden watering can",      plural: "garden watering cans",      emoji: "🌿" },
  { ml: 15000,   singular: "dishwasher cycle",         plural: "dishwasher cycles",         emoji: "🍽️" },
  { ml: 30000,   singular: "10-minute shower",         plural: "10-minute showers",         emoji: "🚿" },
  { ml: 50000,   singular: "washing machine load",     plural: "washing machine loads",     emoji: "👕" },
  { ml: 65000,   singular: "8-minute shower",          plural: "8-minute showers",          emoji: "🚿" },
  { ml: 100000,  singular: "daily water use (1 person)", plural: "daily water use (1 person)", emoji: "🧑" },
  { ml: 150000,  singular: "bathtub",                  plural: "bathtubs",                  emoji: "🛁" },
  { ml: 300000,  singular: "kiddie pool",              plural: "kiddie pools",              emoji: "🏊" },
  { ml: 1000000, singular: "hot tub",                  plural: "hot tubs",                  emoji: "♨️" },
  { ml: 5000000, singular: "small backyard pool",      plural: "small backyard pools",      emoji: "🏊" },
  { ml: 20000000, singular: "backyard pool",           plural: "backyard pools",            emoji: "🏊" },
  { ml: 100000000, singular: "water tanker truck load", plural: "water tanker truck loads", emoji: "🚛" },
  { ml: 2500000000, singular: "Olympic swimming pool", plural: "Olympic swimming pools",   emoji: "🏅" },
];

// Picks two comparisons that bracket `ml` for perspective.
function pickComparisons(ml) {
  let lowerIdx = -1;
  for (let i = 0; i < COMPARISONS.length; i++) {
    if (COMPARISONS[i].ml <= ml) lowerIdx = i;
  }

  if (lowerIdx === -1) {
    const smallest = COMPARISONS[0];
    const frac = (ml / smallest.ml) * 100;
    return `💧 ≈ ${frac.toFixed(1)}% of a ${smallest.singular} ${smallest.emoji}`;
  }

  const lower = COMPARISONS[lowerIdx];
  const lowerCount = ml / lower.ml;
  const lowerText = `💧 ≈ ${lowerCount.toFixed(lowerCount < 10 ? 2 : 0)} ${lowerCount === 1 ? lower.singular : lower.plural} ${lower.emoji}`;

  const upper = COMPARISONS[lowerIdx + 1];
  if (!upper) return lowerText;

  const upperPct = (ml / upper.ml) * 100;
  const upperText = `≈ ${upperPct < 0.01 ? "<0.01" : upperPct.toFixed(2)}% of a ${upper.singular} ${upper.emoji}`;

  return `${lowerText} · ${upperText}`;
}

// --- containers ---------------------------------------------------------

// --- Earth water bodies for dramatic comparisons (volumes in liters) ---
const WATER_BODIES = [
  { name: "Olympic Pool",    emoji: "🏊", volumeL: 2_500_000,     description: "the standard competition pool" },
  { name: "Lake Victoria",   emoji: "🌍", volumeL: 2.42e15,      description: "Africa's largest lake" },
  { name: "Lake Superior",   emoji: "🏔️", volumeL: 12.1e15,      description: "largest freshwater lake by area" },
  { name: "Lake Baikal",     emoji: "🐻", volumeL: 23.6e15,      description: "deepest lake on Earth" },
  { name: "Mediterranean",   emoji: "🌊", volumeL: 4.39e18,      description: "the inland sea" },
  { name: "Pacific Ocean",   emoji: "🌏", volumeL: 660e18,       description: "the big one" },
  { name: "All Oceans",      emoji: "🌍", volumeL: 1.338e21,     description: "Earth's total saltwater" },
];

const CONTAINERS = {
  glass: {
    label: "glass",
    capMl: 300,
    innerWidth: 10,
    innerHeight: 5,
    top: "    ╭────────╮",
    bottom: "    ╰────────╯",
    side: "    │",
    waveChar: "~",
  },
  bottle: {
    label: "bottle",
    capMl: 4000,
    innerWidth: 10,
    innerHeight: 8,
    top: "     ▄▄▄▄▄▄\n    ┌────────┐",
    bottom: "    └────────┘",
    side: "    │",
    waveChar: "~",
  },
  bathtub: {
    label: "bathtub",
    capMl: 150000,
    innerWidth: 28,
    innerHeight: 5,
    top: "   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
    bottom: "   ╰────────────────────────────╯",
    side: "   │",
    waveChar: "~",
  },
  pool: {
    label: "pool",
    capMl: 8000000,
    innerWidth: 36,
    innerHeight: 5,
    top: "   ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈",
    bottom: "   ╰──────────────────────────────────────╯",
    side: "   │",
    waveChar: "≈",
  },
};

function pickContainer(ml) {
  if (ml < CONTAINERS.glass.capMl) return "glass";
  if (ml < CONTAINERS.bottle.capMl) return "bottle";
  if (ml < CONTAINERS.bathtub.capMl) return "bathtub";
  return "pool";
}

// Returns the ANSI color for a given row based on depth gradient.
// displayRow: 0 = top of container, rowFills: array of fill counts (index 0 = top after reverse)
function waterColor(displayRow, rowFills) {
  const filled = rowFills[displayRow];
  if (!filled) return null;
  // Count rows from bottom: bottom-most filled row is deepest
  const totalFilledRows = rowFills.filter((n) => n > 0).length;
  const topFilledDisplayRow = rowFills.findIndex((n) => n > 0);
  const depthFromBottom = (displayRow - topFilledDisplayRow) / Math.max(1, totalFilledRows - 1);
  if (depthFromBottom > 0.6) return c.waterDeep;
  if (depthFromBottom > 0.3) return c.waterMid;
  return c.waterSurface;
}

// Builds the full multi-line render of a container at a given fill fraction.
// Options: { showBubbles: bool, bubbleSeed: number }
function buildContainerLines(containerId, fraction, { showBubbles = false, bubbleSeed = 0 } = {}) {
  const ct = CONTAINERS[containerId];
  const totalCells = ct.innerWidth * ct.innerHeight;
  const filledCells = Math.round(Math.max(0, Math.min(1, fraction)) * totalCells);

  // Determine which rows are filled (bottom-up), and how many cells per row
  const rowFill = []; // rowFill[i] = number of filled cells in display row i
  let remaining = filledCells;
  for (let r = 0; r < ct.innerHeight; r++) {
    const cells = Math.max(0, Math.min(ct.innerWidth, remaining));
    rowFill.push(cells);
    remaining -= cells;
  }
  rowFill.reverse(); // display top-to-bottom

  const filledRows = rowFill.filter((n) => n > 0).length;

  // Generate bubble positions (deterministic based on seed)
  const bubbles = new Set();
  if (showBubbles && filledCells > 0) {
    const rng = mulberry32(bubbleSeed);
    const bubbleCount = Math.min(Math.floor(filledCells * 0.04), 8);
    for (let i = 0; i < bubbleCount; i++) {
      const row = Math.floor(rng() * filledRows);
      const col = Math.floor(rng() * ct.innerWidth);
      bubbles.add(`${row}:${col}`);
    }
  }

  const rows = [];

  // Top border
  for (const l of ct.top.split("\n")) rows.push(`${c.cyan}${l}${c.reset}`);

  // Interior rows
  for (let r = 0; r < ct.innerHeight; r++) {
    const filled = rowFill[r];
    const empty = ct.innerWidth - filled;
    const isSurfaceRow = filled > 0 && r === ct.innerHeight - filledRows;

    let cellStr = "";
    for (let col = 0; col < ct.innerWidth; col++) {
      if (col < filled) {
        if (isSurfaceRow) {
          // Surface row: wave character with shine color
          cellStr += `${c.waterShine}${ct.waveChar}${c.reset}`;
        } else if (bubbles.has(`${r}:${col}`)) {
          // Bubble
          cellStr += `${c.waterShine}○${c.reset}`;
        } else {
          // Deep water
          const color = waterColor(r, rowFill);
          cellStr += `${color}█${c.reset}`;
        }
      } else {
        cellStr += `${c.dim}·${c.reset}`;
      }
    }
    rows.push(`${ct.side}${cellStr}${ct.side}`);
  }

  // Bottom border
  for (const l of ct.bottom.split("\n")) rows.push(`${c.cyan}${l}${c.reset}`);

  return rows;
}

// Simple deterministic PRNG (mulberry32)
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a progress bar line: ▓▓▓▓▓▓░░░░ 68%
function buildProgressLine(fraction, width) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  const filled = Math.round(fraction * width);
  const empty = width - filled;
  const bar = `${c.cyan}${"▓".repeat(filled)}${c.dim}${"░".repeat(empty)}${c.reset}`;
  return `  ${bar}  ${c.bold}${pct}%${c.reset} filled`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Animates a container filling from empty to `fraction`, redrawing in
// place using ANSI cursor-up. Falls back to a static render when not a TTY.
async function animateContainer(ml, { containerId, frames = 18, frameMs = 50 } = {}) {
  const id = containerId || pickContainer(ml);
  const ct = CONTAINERS[id];
  const targetFraction = ml / ct.capMl;

  const finalLines = buildContainerLines(id, targetFraction);

  if (!process.stdout.isTTY) {
    console.log(finalLines.join("\n"));
    return id;
  }

  process.stdout.write("\x1b[?25l"); // hide cursor
  let printedLineCount = 0;

  for (let f = 0; f <= frames; f++) {
    const frameFraction = (f / frames) * Math.min(targetFraction, 1);
    const progressLine = buildProgressLine(frameFraction, 20);
    const lines = buildContainerLines(id, frameFraction, {
      showBubbles: f > 2 && f < frames,
      bubbleSeed: f * 7919,
    });
    const allLines = [progressLine, ...lines];

    if (printedLineCount > 0) {
      process.stdout.write(`\x1b[${printedLineCount}A`);
    }
    process.stdout.write(allLines.map((l) => `\r\x1b[2K${l}`).join("\n") + "\n");
    printedLineCount = allLines.length;
    await sleep(frameMs);
  }

  process.stdout.write("\x1b[?25h"); // show cursor
  return id;
}

module.exports = {
  pickComparisons,
  pickContainer,
  animateContainer,
  CONTAINERS,
  WATER_BODIES,
};
