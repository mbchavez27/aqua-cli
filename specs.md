# aqua-web — Specs

> Specification for the aqua-web companion app.
> Built with **SvelteKit + Svelte 5**, TypeScript, vanilla CSS.

---

## 1. Project Setup

```bash
npx sv create aqua-web --template minimal --types ts
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

## 3. File Structure (SvelteKit)

```
src/
├── app.html                         # HTML shell (og tags, fonts)
├── app.css                          # Global styles, reset, typography
├── routes/
│   ├── +layout.svelte               # Root layout (metadata, global CSS)
│   └── +page.svelte                 # Root page (data state management)
└── lib/
    ├── types.ts                     # TypeScript interfaces
    ├── DropZone.svelte              # File import UI
    ├── Report.svelte                # Main report layout
    ├── ModelTable.svelte            # Per-model breakdown table
    ├── WaterContainer.svelte        # Animated CSS grid container
    ├── WaterImpact.svelte           # Earth comparison cards
    ├── WaterFacts.svelte            # Global water statistics grid
    ├── ReservoirWidget.svelte       # Live reservoir levels
    ├── Progress.svelte              # Progress bar
    ├── Comparisons.svelte           # Real-world comparison text
    └── utils/
        ├── colors.ts                # Color palette constants
        ├── format.ts                # Number formatting helpers
        ├── containers.ts            # Container definitions & selection
        ├── comparisons.ts           # Comparison data & picker
        └── water-bodies.ts          # Earth water body data & comparisons
```

---

## 4. Components

### 4.1 `+page.svelte`

Root page. Manages state: `data` (null or `AquaExport`).

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
- Centered card with water drop SVG icon
- Soft border on hover, subtle lift animation
- Text: "Drop your aqua export" + "or click to browse"
- Kbd hint: `.json` file from `aqua export`
- Error toast with slide-in animation

### 4.3 `Report.svelte`

Main view after import. Stacks all sections vertically.

**Props:**
- `data: AquaExport`
- `onReset: () => void`

**Layout:**
```
┌─────────────────────────────────────────────┐
│  A Q U A   (ASCII art, centered)            │
│  "water footprint estimator, for fun"       │
├─────────────────────────────────────────────┤
│  Summary pills:                             │
│    🔎 Detected: opencode · 💧 380M tokens   │
├─────────────────────────────────────────────┤
│  ModelTable {modelBreakdown}                │
├─────────────────────────────────────────────┤
│  Progress {totalMl / containerCapacity}     │
│  WaterContainer {totalMl}                   │
├─────────────────────────────────────────────┤
│  WaterImpact {totalMl}                      │
│    • Containers Filled                      │
│    • Sessions to Fill (Lake Superior, etc.) │
│    • The Fraction                           │
│    • What Your Water Could Do               │
├─────────────────────────────────────────────┤
│  WaterFacts (2x2 grid of global stats)      │
│  ReservoirWidget (live global reservoirs)   │
├─────────────────────────────────────────────┤
│  History: 1.5B lifetime tokens              │
│  [Export Again] [Reset]                     │
└─────────────────────────────────────────────┘
```

### 4.4 `ModelTable.svelte`

Box-drawing table matching the CLI's visual style.

**Props:**
- `modelBreakdown: ModelRow[]`
- `totalTokens: number`
- `totalMl: number`

**Visual:**
- Card-style container with subtle border
- Row hover effects (background shift)
- Monospace font (JetBrains Mono)
- Numbers right-aligned, model names left-aligned
- Uppercase muted headers

### 4.5 `WaterContainer.svelte`

The core visualization. Renders a CSS-styled container that fills based on `totalMl`.

**Props:**
- `ml: number` (total estimated water)

**Container selection logic:**
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
- CSS grid (width × height cells) with gap
- Cell color based on depth (deep/mid/surface/shine)
- Surface cells use wave animation
- Bubble cells use rising animation
- Fill animation via `$effect` + `requestAnimationFrame` (easeOutCubic, 1800ms)

### 4.6 `WaterImpact.svelte`

Earth comparison cards showing the user's water usage against real-world water bodies.

**Props:**
- `ml: number` (total estimated water)

**Cards:**
1. **Containers Filled** — how many bathtubs, showers, etc. the user filled
2. **Sessions to Fill** — how many identical sessions to fill Lake Superior, Pacific Ocean, etc.
3. **The Fraction** — tiny fraction of a water body the user's usage represents
4. **What Your Water Could Do** — supply a person for X days, water a garden, etc.

**Data source:** `utils/water-bodies.ts` with volumes in liters for 8 water bodies.

### 4.7 `WaterFacts.svelte`

2×2 grid of global water statistics with intersection observer fade-in.

**Data source:** `water-facts.json` with 4 categories:
- Earth's Water (ocean %, freshwater %, etc.)
- Water Stress (people affected, agriculture use, etc.)
- AI Water Footprint (training costs, inference costs, etc.)
- Your Tokens in Perspective (per-token cost, per-billion cost, etc.)

### 4.8 `ReservoirWidget.svelte`

Live global reservoir data visualization.

**Data:** Curated snapshot from reservoirs.earth (11 countries, 1,942 reservoirs).

**Features:**
- SVG arc gauge showing global average fill (50.6%)
- Stat pills (total reservoirs, countries, critically low)
- Country-level mini-bars with color coding (green/blue/amber/red)
- Hover effects on each country row

### 4.9 `Progress.svelte`

Full-width progress bar with label.

**Props:**
- `fraction: number` (0–1)

**Visual:**
- Header row with "Fill level" label and percentage
- Monospace `━` characters, filled in accent color
- Card-style container

### 4.10 `Comparisons.svelte`

Real-world comparison text with emojis. Used internally by WaterImpact.

**Props:**
- `ml: number`

**Logic:** `pickComparisons()` finds the largest reference point ≤ ml and brackets between smaller/larger.

---

## 5. Color Palette

### Water gradient (bottom → top)

| Role | Hex | Usage |
|------|-----|-------|
| Deep water | `#0000ff` | Bottom rows of container |
| Mid water | `#005fff` | Middle rows |
| Surface water | `#0087ff` | Rows near top of fill |
| Surface shine | `#5fffff` | Wave characters, bubbles |

### UI colors

| Element | Hex | Usage |
|---------|-----|-------|
| Page background | `#0a0f1a` | Dark navy, main bg |
| Card background | `rgba(30, 41, 59, 0.5)` | Report cards bg |
| Primary text | `#f8fafc` | Headings, numbers |
| Secondary text | `#94a3b8` | Labels, dim text |
| Muted text | `#64748b` | Hints, footnotes |
| Accent | `#38bdf8` | Links, highlights, progress bar |
| Border | `rgba(56, 189, 248, 0.1)` | Card borders |
| Empty cell | `#334155` | Unfilled container cells |
| Error | `#ef4444` | Error toasts |

---

## 6. Animations

All animations use CSS `@keyframes` or Svelte `$effect` + `requestAnimationFrame`. No JS animation libraries.

### 6.1 Wave animation (surface cells)

Diagonal oscillation with stagger per column.

```css
@keyframes wave {
  0%, 100% { transform: translateX(0) translateY(0); }
  25% { transform: translateX(-1.5px) translateY(-0.5px); }
  75% { transform: translateX(1.5px) translateY(0.5px); }
}
```

### 6.2 Bubble animation (random cells)

Rising bubbles with fade-out, staggered by seed.

```css
@keyframes bubble-rise {
  0% { transform: translateY(0) scale(1); opacity: 0.6; }
  50% { transform: translateY(-6px) scale(1.15); opacity: 0.9; }
  100% { transform: translateY(-14px) scale(0.85); opacity: 0; }
}
```

### 6.3 Fill animation (on import)

Container fills from empty to target fraction over 1800ms with easeOutCubic.

Implemented via `$effect` + `requestAnimationFrame` — no CSS custom properties needed.

### 6.4 Number counters

Token count and mL count animate from 0 to target over 1200ms with easeOutCubic.

### 6.5 Drop zone hover

Subtle lift (`translateY(-2px)`) and glow on hover, stronger lift on drag.

---

## 7. Responsive Breakpoints

| Breakpoint | Width | Behavior |
|-----------|-------|----------|
| Mobile | < 640px | Single column, font-size 14px, container 100% |
| Tablet | 640–768px | Two-column grids collapse to single |
| Desktop | > 768px | Two-column layouts, max-width 960px |

**Container scaling:**
- Mobile: cells min 8px
- Desktop: cells min 12px

---

## 8. Number Formatting

```typescript
function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatMl(ml: number): string {
  if (ml >= 1000000) return (ml / 1000000).toFixed(2) + " L";
  if (ml >= 1000) return (ml / 1000).toFixed(1) + " L";
  return ml.toFixed(1) + " mL";
}

function formatPct(fraction: number): string {
  return (fraction * 100).toFixed(2) + "%";
}

function formatScientific(n: number): string {
  if (n >= 1e15) return (n / 1e15).toFixed(2) + " quadrillion";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + " trillion";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + " billion";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + " million";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(2);
}
```

---

## 9. COMPARISONS Array

Same data as the CLI. Used by `Comparisons.svelte` and `WaterImpact.svelte`.

```typescript
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
```

---

## 10. Earth Water Bodies

Used by `WaterImpact.svelte` for dramatic comparisons.

```typescript
export const WATER_BODIES = [
  { name: "Olympic Pool",    emoji: "🏊", volumeL: 2_500_000,     description: "the standard competition pool" },
  { name: "Lake Victoria",   emoji: "🌍", volumeL: 2.42e15,      description: "Africa's largest lake" },
  { name: "Lake Superior",   emoji: "🏔️", volumeL: 12.1e15,      description: "largest freshwater lake by area" },
  { name: "Lake Baikal",     emoji: "🐻", volumeL: 23.6e15,      description: "deepest lake on Earth" },
  { name: "Mediterranean",   emoji: "🌊", volumeL: 4.39e18,      description: "the inland sea" },
  { name: "Pacific Ocean",   emoji: "🌏", volumeL: 660e18,       description: "the big one" },
  { name: "All Oceans",      emoji: "🌍", volumeL: 1.338e21,     description: "Earth's total saltwater" },
];
```

---

## 11. Typography

```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0a0f1a;
  color: #f8fafc;
  margin: 0;
  padding: 0;
}

.mono {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}
```

Fonts loaded via Google Fonts in `app.html`:
- Inter (400, 500, 600, 700)
- JetBrains Mono (400, 500, 600, 700)

---

## 12. Accessibility

- All text has sufficient contrast against `#0a0f1a` (WCAG AA minimum)
- Drop zone has `role="button"` + `aria-label="Import aqua export file"`
- File input is visually hidden but keyboard-accessible
- Container cells are decorative (aria-hidden="true")
- Comparison text uses `aria-live="polite"` on update

---

## 13. Error Handling

- Invalid JSON: show error toast "Invalid JSON file"
- Wrong schema (missing `version` or `totalMl`): show "Unrecognized export format — run `aqua export` first"
- Empty data (totalTokens = 0): show "No token usage found in this export"

---

## 14. Metadata (Vercel / SEO)

`app.html` includes:
- `<title>` — "aqua-web — Water Footprint Estimator for AI Coding"
- `<meta name="description">` — concise description
- Open Graph tags (og:title, og:description, og:type, og:url)
- Twitter card tags (twitter:card, twitter:title, twitter:description)

---

## 15. Performance Notes

- Max cells per container: 36 × 5 = 180 (pool). No performance concerns.
- Animations use CSS only (composited by browser), no JS re-renders.
- Fill animation uses `requestAnimationFrame` for smooth interpolation.
- Drop zone paste handler reads from `clipboardData`, no external deps.
- Water facts use Intersection Observer for lazy fade-in.
- Zero runtime dependencies. Total build: ~30KB gzipped.
