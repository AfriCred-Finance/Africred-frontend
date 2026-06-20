import type { Config } from "tailwindcss";

// Token-backed palette adopted from the Dirac Finance v3 design system:
// cream background, refined-rust accent, hairline dividers, institutional
// monospace numerals. Colors flow through CSS variables in globals.css so a
// future dark-mode toggle is a single `theme-dark` class away.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    screens: {
      sm: "640px",
      tablet: "712px",
      md: "768px",
      laptop: "1024px",
      lg: "1024px",
      desktop: "1280px",
      xl: "1280px",
      "2xl": "1536px",
      mediumDesktop: "1600px",
      largeDesktop: "1920px",
    },
    extend: {
      colors: {
        // Token-backed (theme-aware via CSS variables).
        bg: "rgb(var(--bg) / <alpha-value>)",
        bg2: "rgb(var(--bg2) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        ink2: "rgb(var(--ink2) / <alpha-value>)",
        ink3: "rgb(var(--ink3) / <alpha-value>)",
        rule: "rgb(var(--rule) / <alpha-value>)",
        rule2: "rgb(var(--rule2) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        accent2: "rgb(var(--accent2) / <alpha-value>)",
        positive: "rgb(var(--positive) / <alpha-value>)",
        negative: "rgb(var(--negative) / <alpha-value>)",

        // Legacy aliases — preserved so existing component code (which uses
        // text-muted / border-line / bg-paper) keeps working under the new palette.
        paper: "rgb(var(--bg) / <alpha-value>)",
        line: "rgb(var(--rule) / <alpha-value>)",
        muted: "rgb(var(--ink2) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      maxWidth: {
        content: "1240px",
      },
      animation: {
        fadeIn: "fadeIn 1.5s",
        slideUp: "slideUp 0.5s",
        slideUpEaseInOut: "slideUp 0.5s ease-in-out",
        slideUpCubicBezier: "slideUp 1s cubic-bezier(0.165, 0.84, 0.44, 1)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      boxShadow: {
        card: "rgba(0, 0, 0, 0.1) 0px 4px 12px",
      },
    },
  },
  plugins: [],
};

export default config;
