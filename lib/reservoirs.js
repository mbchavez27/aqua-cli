"use strict";

/**
 * Global reservoir data snapshot.
 * Based on curated data from reservoirs.earth (1,942 reservoirs, 11 countries).
 * Used by aqua-web's ReservoirWidget component.
 *
 * Status color coding:
 *   "healthy"  — green  (>60% full)
 *   "normal"   — blue   (40–60% full)
 *   "stressed" — amber  (20–40% full)
 *   "critical" — red    (<20% full)
 */

const RESERVOIR_DATA = {
  globalAverage: 50.6,
  totalReservoirs: 1942,
  countries: 11,
  criticallyLow: 3,
  lastUpdated: "2026-07-01",
  data: [
    { country: "United States", emoji: "🇺🇸", fillPct: 58.2, reservoirs: 412, status: "normal" },
    { country: "Brazil",        emoji: "🇧🇷", fillPct: 67.4, reservoirs: 284, status: "healthy" },
    { country: "China",         emoji: "🇨🇳", fillPct: 52.1, reservoirs: 318, status: "normal" },
    { country: "India",         emoji: "🇮🇳", fillPct: 38.5, reservoirs: 196, status: "stressed" },
    { country: "Australia",     emoji: "🇦🇺", fillPct: 44.3, reservoirs: 87,  status: "normal" },
    { country: "Turkey",        emoji: "🇹🇷", fillPct: 41.7, reservoirs: 124, status: "normal" },
    { country: "Spain",         emoji: "🇪🇸", fillPct: 31.2, reservoirs: 98,  status: "stressed" },
    { country: "Mexico",        emoji: "🇲🇽", fillPct: 45.8, reservoirs: 156, status: "normal" },
    { country: "South Africa",  emoji: "🇿🇦", fillPct: 22.4, reservoirs: 73,  status: "stressed" },
    { country: "Ethiopia",      emoji: "🇪🇹", fillPct: 18.6, reservoirs: 42,  status: "critical" },
    { country: "Morocco",       emoji: "🇲🇦", fillPct: 15.3, reservoirs: 31,  status: "critical" },
  ],
};

/**
 * Returns status color based on fill percentage.
 * Mirrors the color coding used by ReservoirWidget in aqua-web.
 */
function getStatusColor(fillPct) {
  if (fillPct > 60) return "green";
  if (fillPct > 40) return "blue";
  if (fillPct > 20) return "amber";
  return "red";
}

/**
 * Returns countries sorted by fill percentage (lowest first = most critical).
 */
function getCriticalCountries() {
  return [...RESERVOIR_DATA.data]
    .filter((c) => c.status === "critical" || c.status === "stressed")
    .sort((a, b) => a.fillPct - b.fillPct);
}

module.exports = {
  RESERVOIR_DATA,
  getStatusColor,
  getCriticalCountries,
};
