import type { Config } from "tailwindcss";

/**
 * FloriSynergy agritech theme — modern, clean, readable on bright screens.
 * Greens for brand, a clear pressure scale (none→low→medium→high).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
        },
        ink: {
          DEFAULT: "#0f172a",
          soft: "#334155",
          faint: "#64748b",
        },
        line: "#e2e8f0",
        surface: "#f8fafc",
        // Pest/disease pressure scale
        pressure: {
          none: "#94a3b8",
          low: "#10b981",
          medium: "#f59e0b",
          high: "#dc2626",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
