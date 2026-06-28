"use client";

import { useEffect } from "react";

export function MiniAppInit() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        if (cancelled) return;
        await sdk.actions.ready();
      } catch {
        // Not running inside a Farcaster client. Safe to ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
