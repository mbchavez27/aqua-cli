"use strict";

/**
 * Visualization layer: turns a milliliter figure into
 *   (a) an animated ASCII container that auto-scales with magnitude, and
 *   (b) a couple of dynamically-picked, relatable real-world comparisons.
 *
 * Everything here is illustrative — see the big warning in bin/aqua.js.
 * The container "capacities" below are chosen to make the animation feel
 * good across a wide range of token counts, not because a water bottle
 * literally holds that number of milliliters in this tool's model.
 */

const c = {
  reset: "\x1b[0m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

// --- real-world reference points, ascending by mL, for comparisons ---
// Sources are rough public-knowledge averages, not precise citations.
const COMPARISONS = [
  { ml: 5, singular: "teaspoon", plural: "teaspoons" },
  { ml: 15, singular: "tablespoon", plural: "tablespoons" },
  { ml: 240, singular: "cup", plural: "cups" },
  { ml: 500, singular: "water bottle", plural: "water bottles" },
  { ml: 6000, singular: "toilet flush", plural: "toilet flushes" },
  { ml: 15000, singular: "dishwasher cycle", plural: "dishwasher cycles" },
  { ml: 50000, singular: "washing machine load", plural: "washing machine loads" },
  { ml: 65000, singular: "8-min shower", plural: "8-min showers" },
  { ml: 150000, singular: "bathtub", plural: "bathtubs" },
  { ml: 20000000, singular: "backyard pool", plural: "backyard pools" },
  { ml: 2500000000, singular: "Olympic pool", plural: "Olympic pools" },
];

// Picks two comparisons that bracket `ml` for perspective: the largest
// reference at or below it, and the next one up. Falls back gracefully
// at both ends of the scale.
function pickComparisons(ml) {
  let lowerIdx = -1;
  for (let i = 0; i < COMPARISONS.length; i++) {
    if (COMPARISONS[i].ml <= ml) lowerIdx = i;
  }

  if (lowerIdx === -1) {
    // smaller than even a teaspoon
    const smallest = COMPARISONS[0];
    const frac = (ml / smallest.ml) * 100;
    return `≈ ${frac.toFixed(1)}% of a ${smallest.singular}`;
  }

  const lower = COMPARISONS[lowerIdx];
  const lowerCount = ml / lower.ml;
  const lowerText = `≈ ${lowerCount.toFixed(lowerCount < 10 ? 2 : 0)} ${lowerCount === 1 ? lower.singular : lower.plural}`;

  const upper = COMPARISONS[lowerIdx + 1];
  if (!upper) return lowerText; // past the top of the scale (Olympic pools+)

  const upperPct = (ml / upper.ml) * 100;
  const upperText = `≈ ${upperPct < 0.01 ? "<0.01" : upperPct.toFixed(2)}% of a ${upper.singular}`;

  return `${lowerText} · ${upperText}`;
}

// --- containers ---------------------------------------------------------
// Each container is defined by interior dimensions; borders are drawn
// around it. Fill happens bottom-up, left-to-right within each row.

const CONTAINERS = {
  glass: {
    label: "glass",
    capMl: 300,
    innerWidth: 6,
    innerHeight: 4,
    top: "  ╭────╮",
    bottom: "  ╰────╯",
    side: "  │",
  },
  bottle: {
    label: "bottle",
    capMl: 4000,
    innerWidth: 6,
    innerHeight: 6,
    top: "   ▄▄\n  ┌──┐",
    bottom: "  └──┘",
    side: "  │",
  },
  bathtub: {
    label: "bathtub",
    capMl: 150000,
    innerWidth: 20,
    innerHeight: 3,
    top: " ~~~~~~~~~~~~~~~~~~~~",
    bottom: " ╰──────────────────╯",
    side: "│",
  },
  pool: {
    label: "pool",
    capMl: 8000000,
    innerWidth: 28,
    innerHeight: 3,
    top: " ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈",
    bottom: " ╰──────────────────────────╯",
    side: "│",
  },
};

// Auto-picks a container so the animation feels proportionate at any scale.
function pickContainer(ml) {
  if (ml < CONTAINERS.glass.capMl) return "glass";
  if (ml < CONTAINERS.bottle.capMl) return "bottle";
  if (ml < CONTAINERS.bathtub.capMl) return "bathtub";
  return "pool";
}

// Builds the full multi-line render of a container at a given fill fraction
// (0..1). Returns an array of lines (top border, interior rows, bottom border).
function buildContainerLines(containerId, fraction) {
  const ct = CONTAINERS[containerId];
  const totalCells = ct.innerWidth * ct.innerHeight;
  const filledCells = Math.round(Math.max(0, Math.min(1, fraction)) * totalCells);

  const rows = [];
  // build bottom-up so water visually rises from the base
  let remaining = filledCells;
  const interiorRows = [];
  for (let r = 0; r < ct.innerHeight; r++) {
    const cellsThisRow = Math.max(0, Math.min(ct.innerWidth, remaining));
    remaining -= cellsThisRow;
    const filledStr = `${c.blue}${"█".repeat(cellsThisRow)}${c.reset}`;
    const emptyStr = `${c.dim}${"·".repeat(ct.innerWidth - cellsThisRow)}${c.reset}`;
    interiorRows.push(`${ct.side}${filledStr}${emptyStr}${ct.side}`);
  }
  interiorRows.reverse(); // bottom row was built first; display top-to-bottom

  for (const l of ct.top.split("\n")) rows.push(`${c.cyan}${l}${c.reset}`);
  for (const l of interiorRows) rows.push(l);
  for (const l of ct.bottom.split("\n")) rows.push(`${c.cyan}${l}${c.reset}`);

  return rows;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Animates a container filling from empty to `fraction`, redrawing in
// place using ANSI cursor-up. Falls back to a single static render when
// stdout isn't a TTY.
async function animateContainer(ml, { containerId, frames = 14, frameMs = 55 } = {}) {
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
    const lines = buildContainerLines(id, frameFraction);

    if (printedLineCount > 0) {
      process.stdout.write(`\x1b[${printedLineCount}A`); // move cursor up
    }
    process.stdout.write(lines.map((l) => `\r\x1b[2K${l}`).join("\n") + "\n");
    printedLineCount = lines.length;
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
};
