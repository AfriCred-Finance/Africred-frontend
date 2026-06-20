"use client";

import { useEffect, useState } from "react";

/**
 * Sun/Moon button. Toggles between the `theme-light` and `theme-dark` class on
 * <html>. Persists the choice to localStorage. A pre-paint snippet in
 * `layout.tsx` applies the persisted choice before any CSS evaluates so we
 * don't flash the wrong theme on first paint.
 */
export function ThemeToggle() {
  // null until hydrated — prevents the initial render from showing the wrong icon.
  const [isLight, setIsLight] = useState<boolean | null>(null);

  useEffect(() => {
    setIsLight(document.documentElement.classList.contains("theme-light"));
  }, []);

  const toggle = () => {
    const next = !isLight;
    document.documentElement.classList.toggle("theme-light", next);
    document.documentElement.classList.toggle("theme-dark", !next);
    try {
      localStorage.setItem("africred-theme", next ? "light" : "dark");
    } catch {
      // ignore quota / disabled storage
    }
    setIsLight(next);
  };

  return (
    <button type="button" onClick={toggle} aria-label="Toggle theme" className="theme-toggle">
      {isLight ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
