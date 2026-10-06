// SPDX-License-Identifier: Apache-2.0

import type { Config } from "tailwindcss";

// "Cinematic darkroom" design system: paper type on a near-black stage, with
// colour reserved for meaning. Each signal hue below has one job, and each
// party in the deal has an identity hue (components/app/party.tsx). Shape
// is binary: pill (999px) for buttons and tags, sharp (0px) for cards, inputs,
// and panels. Depth is tonal contrast; glow marks live signals only.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#FFFFFF",
        ink: "#000000",
        carbon: "#0C0C0E",
        // Raised surfaces on carbon: table heads, inputs, the receipt card.
        coal: "#141417",
        // Greys, lightest first. Each holds AA contrast on ink at its size.
        smoke: "#C4C4CA",
        pewter: "#A3A3AA",
        ash: "#8E8E96",
        graphite: "#6E6E76",
        // Signals.
        amber: "#FFAC2E", // live or waiting on someone
        mint: "#3DDC97", // committed, settled, holds
        rose: "#FF5C72", // refused, disqualified, broken
        sky: "#5AC8FA", // information, shared, agreed
        iris: "#A78BFA", // private: MNPI, private side
      },
      fontFamily: {
        // Inter everywhere, wired through next/font's CSS variable.
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        // Binary radius only: sharp panels, pill controls.
        none: "0px",
        pill: "999px",
      },
      keyframes: {
        // Slow "mercury flow" ambient drift for the marketing hero render only.
        "mercury-drift": {
          "0%, 100%": { transform: "scale(1.14) translate3d(0, 0, 0)" },
          "33%": { transform: "scale(1.2) translate3d(2.5%, -2%, 0)" },
          "66%": { transform: "scale(1.18) translate3d(-2%, 1.5%, 0)" },
        },
        // Drifting specular highlight for the frosted "liquid glass" sheen.
        "glass-sheen": {
          "0%, 100%": { transform: "translate3d(0, 0, 0)", opacity: "0.55" },
          "50%": { transform: "translate3d(5%, 4%, 0)", opacity: "1" },
        },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        "mercury-drift": "mercury-drift 20s ease-in-out infinite",
        "glass-sheen": "glass-sheen 14s ease-in-out infinite",
        "spin-slow": "spin-slow 18s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
