/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Project Arrow Brand Colors
        brand: {
          // Backgrounds
          midnight: "#040A05",        // Midnight Jungle
          forest: {
            deep: "#031912",          // Deep Forest
            shadow: "#0C2B25",        // Forest Shadow
          },
          teal: {
            atmospheric: "#123C3A",   // Atmospheric Teal
            mountain: "#255454",      // Mountain Teal
            misty: "#487674",         // Misty Blue Teal
          },
          // Primary Accents & CTAs
          emerald: {
            electric: "#2BE38B",      // Electric Emerald
            fresh: "#3DCF8E",         // Fresh Emerald
            mint: "#6CE9B4",          // Luminous Mint
          },
          // Surfaces & Soft Highlights
          seaglass: "#C4DDD1",        // Soft Sea Glass
          // Low-confidence warnings / HITL alerts
          gold: {
            sunset: "#F1C087",         // Sunset Gold
          },
          copper: {
            warm: "#BE8144",          // Warm Copper
          },
          // Typography
          white: "#F8F9FB",           // White Text
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow-emerald': '0 0 20px rgba(43, 227, 139, 0.25)',
        'glow-gold': '0 0 20px rgba(241, 192, 135, 0.25)',
      },
    },
  },
  plugins: [],
}
