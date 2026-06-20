"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address } from "viem";

const EVENT = parseAbiItem(
  "event LoanRepaymentRecorded(uint256 indexed loanId, uint256 amount, uint256 totalRepaid, uint32 installmentsPaid, uint256 nextInstallmentAmount, uint256 nextDueDate)",
);

export type RepaymentLog = {
  amount: bigint;
  installmentsPaid: number;
  blockNumber: bigint;
  blockTimestamp: number; // unix seconds
  txHash: `0x${string}`;
};

// Module-level cache: same loanId on the same registry won't refetch within a session.
const cache = new Map<string, RepaymentLog[]>();

/**
 * Pulls the on-chain repayment history for a loan by querying past
 * `LoanRepaymentRecorded` events on the loan registry. Returns sorted by
 * `installmentsPaid` ascending (oldest → newest), one entry per recorded
 * repayment, with the block timestamp + tx hash so the UI can render real
 * dates and clickable transaction links.
 *
 * Skips the fetch entirely when `installmentsPaid` is zero (nothing to show),
 * caches results per (registry, loanId) for the session, and only enriches
 * logs with block timestamps when there's at least one log to enrich.
 */
export function useRepaymentHistory(registry?: Address, loanId?: bigint, installmentsPaid?: number) {
  const client = usePublicClient();
  const [logs, setLogs] = useState<RepaymentLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const key = registry && loanId !== undefined ? `${registry.toLowerCase()}:${loanId.toString()}` : "";

  useEffect(() => {
    if (!client || !registry || loanId === undefined) {
      setLogs([]);
      return;
    }
    // Nothing paid yet → no logs exist, skip the RPC roundtrip entirely.
    if (installmentsPaid !== undefined && installmentsPaid === 0) {
      setLogs([]);
      return;
    }

    // Serve from cache if we've already fetched this loan's history.
    if (cache.has(key)) {
      setLogs(cache.get(key)!);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const rawLogs = await client.getLogs({
          address: registry,
          event: EVENT,
          args: { loanId },
          fromBlock: 0n,
          toBlock: "latest",
        });

        // Only enrich with timestamps if we actually have logs.
        const tsByBlock = new Map<bigint, number>();
        if (rawLogs.length > 0) {
          const uniqueBlocks = Array.from(new Set(rawLogs.map((l) => l.blockNumber)));
          const blocks = await Promise.all(uniqueBlocks.map((bn) => client.getBlock({ blockNumber: bn })));
          for (const b of blocks) tsByBlock.set(b.number, Number(b.timestamp));
        }

        const enriched: RepaymentLog[] = rawLogs.map((l) => ({
          amount: l.args.amount ?? 0n,
          installmentsPaid: Number(l.args.installmentsPaid ?? 0),
          blockNumber: l.blockNumber,
          blockTimestamp: tsByBlock.get(l.blockNumber) ?? 0,
          txHash: l.transactionHash,
        }));
        enriched.sort((a, b) => a.installmentsPaid - b.installmentsPaid);
        cache.set(key, enriched);
        if (!cancelled) setLogs(enriched);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error("Failed to fetch repayment history"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, registry, loanId, installmentsPaid, key]);

  return { logs, loading, error };
}
