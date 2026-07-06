"use client";

import { useEffect, useState } from "react";
import { queryDepth, queryCurrentEpoch, type DepthResponse } from "./secretpath";
import { SECRET_MATCHING_ADDR } from "./contracts";

export interface SecretDepthState {
  configured: boolean;
  loading: boolean;
  error?: string;
  depth?: DepthResponse;
  epoch?: number;
  epochEndsAt?: number;
}

/// Polls the Secret matching contract for aggregated book depth for one vault.
/// Returns loading/error/configured state so the UI can render meaningfully
/// even when the Secret contract hasn't been deployed yet.
export function useSecretDepth(vault: string, intervalMs = 15_000): SecretDepthState {
  const [state, setState] = useState<SecretDepthState>({
    configured: Boolean(SECRET_MATCHING_ADDR),
    loading: Boolean(SECRET_MATCHING_ADDR),
  });

  useEffect(() => {
    if (!SECRET_MATCHING_ADDR) {
      setState({ configured: false, loading: false });
      return;
    }
    let cancelled = false;

    async function tick() {
      try {
        const [d, e] = await Promise.all([queryDepth(vault), queryCurrentEpoch(vault)]);
        if (cancelled) return;
        setState({
          configured: true,
          loading: false,
          depth: d,
          epoch: e.epoch,
          epochEndsAt: e.ends_at,
        });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [vault, intervalMs]);

  return state;
}
