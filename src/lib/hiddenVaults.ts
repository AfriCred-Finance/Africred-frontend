"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "africred.hiddenVaults";

function read(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr.map((a) => a.toLowerCase()));
  } catch {
    return new Set();
  }
}

function write(set: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(Array.from(set)));
}

/**
 * Per-browser list of vault addresses the admin has chosen to hide from the
 * public /vaults listing. Persisted in localStorage. Not synced across devices.
 */
export function useHiddenVaults() {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setHidden(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setHidden(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isHidden = useCallback((addr: string) => hidden.has(addr.toLowerCase()), [hidden]);

  const toggle = useCallback((addr: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      const key = addr.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      write(next);
      return next;
    });
  }, []);

  return { isHidden, toggle };
}
