# aqua-web — Svelte App Specs

> Detailed specification for the aqua-web companion app.
> Built with **Svelte 5 + Vite**, zero other dependencies.

---

## 1. Project Setup

```bash
npm create vite@latest aqua-web -- --template svelte
cd aqua-web
npm install
npm run dev
```

No additional packages. No Tailwind, no component libraries, no animation libs —
everything is vanilla CSS + Svelte 5 runes (`$state`, `$derived`, `$effect`).

---

## 2. Data Schema

The app accepts a single JSON file (exported via `aqua export`). The schema:

```typescript
interface AquaExport {
  version: 1;
  exportedAt: string;        // ISO 8601 timestamp
  mode: "sync" | "auto";
  totalTokens: number;
  totalMl: number;
  sources: SourceRow[];
  modelBreakdown: ModelRow[];
  history: HistoryData;
}

interface SourceRow {
  id: string;                // "opencode" | "claude" | "codex" | "gemini"
  label: string;             // "opencode" | "Claude Code" | "Codex CLI" | "Gemini CLI"
  tokens: number;
  files: number;
}

interface ModelRow {
  model: string;             // e.g. "mimo-v2.5-free", "unknown (older sessions)"
  tokens: number;
  mlPer1k: number;           // mL per 1,000 tokens
}

interface HistoryData {
  totalTokens: number;
  totalMl: number;
  runCount: number;
}
```

---

## 3. File Structure

```
aqua-web/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js              # mount App
│   ├── App.svelte           # root component
│   ├── DropZone.svelte      # file import UI
│   ├── Report.svelte        # main report view (shown after import)
│   ├── ModelTable.svelte    # per-model breakdown table
│   ├── WaterContainer.svelte # animated container visualization
│   ├── Comparisons.svelte   # real-world comparison text
│   ├── Progress.svelte      # progress bar
│   ├── utils/
│   │   ├── containers.js    # container definitions (capacity, dimensions)
│   │   ├── comparisons.js   # COMPARISONS array + pickComparisons()
│   │   ├── colors.js        # color palette constants
│   │   └── format.js        # number formatting helpers
│   └── styles/
│       └── global.css       # reset, fonts, base styles
└── public/
    └── favicon.svg
```

---

## 4. Components

### 4.1 `App.svelte`

Root component. Manages state: `data` (null or `AquaExport`).

```
State:
  let data = $state(null);

Template:
  {#if data}
    <Report {data} onReset={() => data = null} />
  {:else}
    <DropZone onImport={(json) => data = json} />
  {/if}
```

### 4.2 `DropZone.svelte`

Full-screen drag-and-drop zone with a file picker fallback.

**Props:**
- `onImport: (data: AquaExport) => void`

**Behavior:**
- Listens for `dragover`, `drop`, `click` (file input), `paste` (clipboard)
- Validates JSON has `version === 1` and `totalMl` field
- Parses and calls `onImport`
- Shows error toast if invalid

**Visual:**
- Centered dashed border box (2px dashed `#3b82f6`)
- Hover state: border solid, background `rgba(59, 130, 246, 0.05)`
- Text: "Drop your aqua export here" + "or click to browse"
- Subtle pulse animation on the icon

### 4.3 `Report.svelte`

Main view after import. Stacks all sections vertically.

**Props:**
- `data: AquaExport`
- `onReset: () => void`

**Layout:**
```
┌─────────────────────────────────────────────┐
│  aqua  logo (ASCII art, centered)           │
│  "water footprint estimator, for fun"       │
├─────────────────────────────────────────────┤
│  Summary bar:                               │
│    🔎 Detected: opencode                    │
│    380,398,365 tokens                       │
├─────────────────────────────────────────────┤
│  ModelTable {modelBreakdown}                │
├─────────────────────────────────────────────┤
│  Progress {totalMl / containerCapacity}     │
│  WaterContainer {totalMl}                   │
│  Comparisons {totalMl}                      │
├─────────────────────────────────────────────┤
│  History: 1,518,381,778 lifetime tokens     │
│  [Export Again] [Reset]                     │
└─────────────────────────────────────────────┘
```

### 4.4 `ModelTable.svelte`

Box-drawing table matching the CLI's visual style.

**Props:**
- `modelBreakdown: ModelRow[]`
- `totalTokens: number`
- `totalMl: number`

**Template structure (CSS borders, not ASCII):**
```
┌──────────────────────────────────────────────────┐
│  Model                         Tokens  Water (est.) │
├──────────────────────────────────────────────────┤
│  mimo-v2.5-free           121,164,525  1817468 mL  │
│  deepseek-v4-flash-free    84,895,342  1697907 mL  │
│  ...                                              │
├──────────────────────────────────────────────────┤
│  Total                    380,398,365  5873834 mL  │
└──────────────────────────────────────────────────┘
```

**CSS approach:**
- `border: 2px solid #38bdf8` (cyan-400) on outer container
- Header row, separator rows, and footer row use `border-top` / `border-bottom`
- Columns use CSS grid or flexbox for alignment
- Monospace font (`font-family: 'JetBrains Mono', 'Fira Code', monospace`)
- Numbers right-aligned, model names left-aligned

### 4.5 `WaterContainer.svelte`

The core visualization. Renders a CSS-styled container that fills based on `totalMl`.

**Props:**
- `ml: number` (total estimated water)

**Container selection logic (same as CLI):**
```javascript
function pickContainer(ml) {
  if (ml < 300) return "glass";
  if (ml < 4000) return "bottle";
  if (ml < 150000) return "bathtub";
  return "pool";
}
```

**Container definitions:**
```javascript
const CONTAINERS = {
  glass:    { capMl: 300,      innerWidth: 10, innerHeight: 5 },
  bottle:   { capMl: 4000,     innerWidth: 10, innerHeight: 8 },
  bathtub:  { capMl: 150000,   innerWidth: 28, innerHeight: 5 },
  pool:     { capMl: 8000000,  innerWidth: 36, innerHeight: 5 },
};
```

**Rendering:**
- The container is a `<div>` with CSS grid (width × height cells)
- Each cell is a `<div>` with a background color based on depth
- Surface cells use a wave animation
- Bubble cells use a rising animation
- Fill fraction = `ml / capMl`, clamped to [0, 1]

**Cell layout:**
```
Total cells = innerWidth × innerHeight
Filled cells = round(fraction × totalCells)
Filled rows (from bottom): fill bottom-up, reverse for display top-to-bottom
```

### 4.6 `Progress.svelte`

Progress bar with percentage.

**Props:**
- `fraction: number` (0–1)

**Template:**
```
▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  60% filled
```

**CSS:**
- Container: `display: flex; gap: 8px; align-items: center`
- Bar: monospace characters, filled cells `color: #38bdf8`, empty cells `color: #64748b`
- Percentage: bold, white text

### 4.7 `Comparisons.svelte`

Real-world comparison text with emojis.

**Props:**
- `ml: number`

**Logic:** (identical to CLI's `pickComparisons`)
```javascript
function pickComparisons(ml) {
  // Find the largest reference point <= ml
  // Print: "💧 ≈ X <unit> <emoji> · ≈ Y% of a <unit> <emoji>"
  // Brackets the actual value between a smaller and larger reference
}
```

**Template:**
```
💧 ≈ 1.14 small backyard pools 🏊 · ≈ 28.53% of a backyard pool 🏊
```

---

## 5. Color Palette

All colors derived from the CLI's ANSI codes, mapped to hex for CSS.

### Water gradient (bottom → top)

| Role | CLI ANSI | Hex | Usage |
|------|----------|-----|-------|
| Deep water | `38;5;21` | `#0000ff` | Bottom rows of container |
| Mid water | `38;5;27` | `#005fff` | Middle rows |
| Surface water | `38;5;45` | `#0087ff` | Rows near top of fill |
| Surface shine | `38;5;87` | `#5fffff` | Wave characters, bubbles |

### Container borders

| Element | Hex | Usage |
|---------|-----|-------|
| Border color | `#38bdf8` | Container outlines, table borders |
| Border glow | `rgba(56, 189, 248, 0.3)` | Subtle box-shadow on hover |

### Background / text

| Element | Hex | Usage |
|---------|-----|-------|
| Page background | `#0f172a` | Dark navy, main bg |
| Card background | `#1e293b` | Report card bg |
| Primary text | `#f8fafc` | Headings, numbers |
| Secondary text | `#94a3b8` | Labels, dim text |
| Accent | `#38bdf8` | Links, highlights, progress bar |
| Error | `#f59e0b` | Warnings |

### Empty cell

| Element | Hex | Usage |
|---------|-----|-------|
| Empty cell | `#334155` | Unfilled container cells (slate-700) |

---

## 6. Animations

All animations use CSS `@keyframes`. No JS animation libraries.

### 6.1 Wave animation

The surface row of water has a subtle horizontal oscillation.

```css
@keyframes wave {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(-3px); }
}

.wave-cell {
  animation: wave 1.5s ease-in-out infinite;
  animation-delay: calc(var(--col) * 0.05s); /* stagger per column */
}
```

### 6.2 Bubble animation

Random cells in the water show rising bubbles.

```css
@keyframes bubble-rise {
  0% { transform: translateY(0) scale(1); opacity: 0.7; }
  50% { transform: translateY(-8px) scale(1.2); opacity: 1; }
  100% { transform: translateY(-16px) scale(0.8); opacity: 0; }
}

.bubble-cell {
  animation: bubble-rise 2s ease-in-out infinite;
  animation-delay: calc(var(--seed) * 0.3s);
}
```

### 6.3 Fill animation (on import)

The container fills from empty to the target fraction over ~1.5 seconds.

```css
@keyframes fill-up {
  from { --fill-fraction: 0; }
  to { --fill-fraction: var(--target); }
}

/* Use CSS Houdini @property for animatable custom properties (progressive enhancement) */
@property --fill-fraction {
  syntax: '<number>';
  initial-value: 0;
  inherits: false;
}
```

**Fallback:** Use Svelte's `$effect` + `requestAnimationFrame` to interpolate
`fillFraction` from 0 → target over 1500ms with easeOutCubic easing.

### 6.4 Drop zone pulse

```css
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.05); opacity: 1; }
}

.drop-icon {
  animation: pulse 2s ease-in-out infinite;
}
```

---

## 7. Responsive Breakpoints

| Breakpoint | Width | Behavior |
|-----------|-------|----------|
| Mobile | < 640px | Single column, container width 100%, table scrolls horizontally |
| Tablet | 640–1024px | Single column, container width 80%, table fits |
| Desktop | > 1024px | Centered max-width 800px container, full table |

**Container scaling:**
- Mobile: inner cells shrink to fit viewport (min 8px per cell)
- Desktop: cells are 12px × 12px

---

## 8. Number Formatting

```javascript
// Locale-aware thousands separator
function formatNumber(n) {
  return n.toLocaleString("en-US");
}

// Water volume with smart precision
function formatMl(ml) {
  if (ml >= 1000000) return (ml / 1000000).toFixed(2) + " L";
  if (ml >= 1000) return (ml / 1000).toFixed(1) + " L";
  return ml.toFixed(1) + " mL";
}

// Percentage with 2 decimal places
function formatPct(fraction) {
  return (fraction * 100).toFixed(2) + "%";
}
```

---

## 9. COMPARISONS Array

Exact same data as the CLI. Include in `utils/comparisons.js`:

```javascript
export const COMPARISONS = [
  { ml: 5,         singular: "teaspoon of water",          plural: "teaspoons of water",          emoji: "🥄" },
  { ml: 15,        singular: "tablespoon of water",        plural: "tablespoons of water",        emoji: "🥄" },
  { ml: 75,        singular: "shot of espresso",           plural: "shots of espresso",           emoji: "☕" },
  { ml: 240,       singular: "cup of coffee",              plural: "cups of coffee",              emoji: "☕" },
  { ml: 350,       singular: "can of soda",                plural: "cans of soda",                emoji: "🥤" },
  { ml: 500,       singular: "water bottle",               plural: "water bottles",               emoji: "🍶" },
  { ml: 1000,      singular: "large water bottle (1L)",    plural: "large water bottles (1L)",    emoji: "🫗" },
  { ml: 3000,      singular: "bucket of water",            plural: "buckets of water",            emoji: "🪣" },
  { ml: 6000,      singular: "toilet flush",               plural: "toilet flushes",              emoji: "🚽" },
  { ml: 8000,      singular: "garden watering can",        plural: "garden watering cans",        emoji: "🌿" },
  { ml: 15000,     singular: "dishwasher cycle",           plural: "dishwasher cycles",           emoji: "🍽️" },
  { ml: 30000,     singular: "10-minute shower",           plural: "10-minute showers",           emoji: "🚿" },
  { ml: 50000,     singular: "washing machine load",       plural: "washing machine loads",       emoji: "👕" },
  { ml: 65000,     singular: "8-minute shower",            plural: "8-minute showers",            emoji: "🚿" },
  { ml: 100000,    singular: "daily water use (1 person)", plural: "daily water use (1 person)",  emoji: "🧑" },
  { ml: 150000,    singular: "bathtub",                    plural: "bathtubs",                    emoji: "🛁" },
  { ml: 300000,    singular: "kiddie pool",                plural: "kiddie pools",                emoji: "🏊" },
  { ml: 1000000,   singular: "hot tub",                    plural: "hot tubs",                    emoji: "♨️" },
  { ml: 5000000,   singular: "small backyard pool",        plural: "small backyard pools",        emoji: "🏊" },
  { ml: 20000000,  singular: "backyard pool",              plural: "backyard pools",              emoji: "🏊" },
  { ml: 100000000, singular: "water tanker truck load",    plural: "water tanker truck loads",    emoji: "🚛" },
  { ml: 2500000000, singular: "Olympic swimming pool",     plural: "Olympic swimming pools",      emoji: "🏅" },
];

export function pickComparisons(ml) {
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
```

---

## 10. Container Cell Rendering

### Cell color logic

```javascript
// displayRow: 0 = top of container, totalRows = bottom
// filledRows: array of fill counts (after reverse, index 0 = top)
function cellColor(displayRow, col, filledCellsPerRow, totalRows) {
  const filled = filledCellsPerRow[displayRow];
  if (col >= filled) return COLORS.empty; // #334155

  const totalFilledRows = filledCellsPerRow.filter(n => n > 0).length;
  const topFilledRow = filledCellsPerRow.findIndex(n => n > 0);
  const depthFromBottom = (displayRow - topFilledRow) / Math.max(1, totalFilledRows - 1);

  if (depthFromBottom > 0.6) return COLORS.waterDeep;   // #0000ff
  if (depthFromBottom > 0.3) return COLORS.waterMid;     // #005fff
  return COLORS.waterSurface;                             // #0087ff
}
```

### Surface row detection

```javascript
const isSurfaceRow = filled > 0 && displayRow === topFilledRow;
// Surface cells get the wave animation + shine color (#5fffff)
```

### Bubble positions

Use a deterministic PRNG (same as CLI's mulberry32) seeded with a timestamp
to place 4–8 bubbles randomly within filled cells.

```javascript
function mulberry32(seed) {
  let s = seed | 0;
  return function() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

---

## 11. Typography

```css
/* global.css */
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0f172a;
  color: #f8fafc;
  margin: 0;
  padding: 0;
}

.mono {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}
```

For the ASCII logo, use a `<pre>` with monospace font and a subtle
`text-shadow: 0 0 10px rgba(56, 189, 248, 0.3)` glow effect.

---

## 12. Accessibility

- All text has sufficient contrast against `#0f172a` (WCAG AA minimum)
- Drop zone has `role="button"` + `aria-label="Import aqua export file"`
- File input is visually hidden but keyboard-accessible
- Container cells are decorative (aria-hidden="true")
- Comparisons text uses semantic `<p>` with `aria-live="polite"` on update

---

## 13. Error Handling

- Invalid JSON: show red toast "Invalid JSON file"
- Wrong schema (missing `version` or `totalMl`): show "Unrecognized export format — run `aqua export` first"
- Empty data (totalTokens = 0): show "No token usage found in this export"

---

## 14. Performance Notes

- Max cells per container: 36 × 5 = 180 (pool). No performance concerns.
- Animations use CSS only (composited by browser), no JS re-renders.
- Drop zone paste handler reads from `clipboardData`, no external deps.
