import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Muted, low-saturation palette — no vibrant colors.
        ink: "#18181b", // zinc-900
        paper: "#fafaf9", // stone-50
        line: "#e7e5e4", // stone-200
        muted: "#78716c", // stone-500
        accent: "#3f6212", // desaturated olive, used sparingly for positive states
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
