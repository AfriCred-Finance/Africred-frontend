"use client";

import Link from "next/link";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { useVault } from "@/lib/useVault";
import { fmtUnits, phaseLabel } from "@/lib/format";
import { PhaseBadge } from "./Stat";

export function VaultCard({ address }: { address: Address }) {
  const { address: account } = useAccount();
  const { vault } = useVault(address, account);

  return (
    <Link href={`/vault/${address}`} className="card block p-5 transition-colors hover:border-ink/30">
      <div className="flex items-center justify-between">
        <div className="font-medium tracking-tight">{vault?.name ?? "Loading…"}</div>
        {vault && <PhaseBadge phase={phaseLabel(vault.phase)} />}
      </div>
      <div className="mt-1 text-xs text-muted">{vault?.symbol ?? ""}</div>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted">TVL</div>
          <div className="text-base font-semibold">
            {vault ? `$${fmtUnits(vault.totalAssets, vault.decimals)}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Share price</div>
          <div className="text-base font-semibold">{vault ? vault.sharePrice.toFixed(4) : "—"}</div>
        </div>
      </div>
    </Link>
  );
}
