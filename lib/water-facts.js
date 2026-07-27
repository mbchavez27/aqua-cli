"use strict";

/**
 * Global water statistics organized by category.
 * Used by aqua-web's WaterFacts component (2×2 grid display).
 *
 * Sources: USGS, WHO, UN-Water, published AI sustainability research.
 * All figures are approximate and for illustrative purposes.
 */

const WATER_FACTS = {
  earthsWater: {
    title: "Earth's Water",
    icon: "🌍",
    facts: [
      { label: "Saltwater (oceans)", value: "96.5%", detail: "of all Earth's water" },
      { label: "Freshwater", value: "2.5%", detail: "of all Earth's water" },
      { label: "Accessible freshwater", value: "0.3%", detail: "of total freshwater" },
      { label: "Ice caps & glaciers", value: "68.7%", detail: "of freshwater" },
    ],
  },
  waterStress: {
    title: "Water Stress",
    icon: "💧",
    facts: [
      { label: "People lacking safe water", value: "2.2B", detail: "globally (WHO/UNICEF)" },
      { label: "Agriculture water use", value: "70%", detail: "of global freshwater" },
      { label: "Water scarcity by 2025", value: "1.8B", detail: "people affected" },
      { label: "Daily deaths (water-borne)", value: "1,000+", detail: "children under 5" },
    ],
  },
  aiWaterFootprint: {
    title: "AI Water Footprint",
    icon: "🤖",
    facts: [
      { label: "GPT-4 training (est.)", value: "~700K L", detail: "water for cooling" },
      { label: "Google AI water use", value: "+20%", detail: "year-over-year growth" },
      { label: "Data center PUE", value: "1.1–1.5", detail: "power usage effectiveness" },
      { label: "Inference vs training", value: "~60%", detail: "of lifetime water use" },
    ],
  },
  tokensInPerspective: {
    title: "Tokens in Perspective",
    icon: "📊",
    facts: [
      { label: "Per 1K tokens (avg)", value: "~15 mL", detail: "estimated water cost" },
      { label: "Per billion tokens", value: "~15 L", detail: "estimated water cost" },
      { label: "Typical coding session", value: "~50K", detail: "tokens used" },
      { label: "Session water cost", value: "~750 mL", detail: "≈ a water bottle" },
    ],
  },
};

module.exports = { WATER_FACTS };
