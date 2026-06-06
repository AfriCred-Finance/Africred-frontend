"use client";

import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { factoryAbi } from "@/lib/abis";
import { FACTORY_ADDRESS } from "@/lib/contracts";
import { VaultCard } from "@/components/VaultCard";
import { ConfigBanner } from "@/components/ConfigBanner";

export default function VaultsPage() {
  const { data: vaults, isLoading } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "allVaults",
    query: { enabled: Boolean(FACTORY_ADDRESS), refetchInterval: 10000 },
  });

  const list = (vaults as Address[] | undefined) ?? [];

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vaults</h1>
          <p className="mt-1 text-sm text-muted">All credit vaults deployed by the protocol.</p>
        </div>
      </div>

      <ConfigBanner />

      {FACTORY_ADDRESS && isLoading && <p className="text-sm text-muted">Loading vaults…</p>}

      {FACTORY_ADDRESS && !isLoading && list.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">
          No vaults yet. Create one from the <a className="text-ink underline" href="/admin">Admin</a> page.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {list.map((v) => (
          <VaultCard key={v} address={v} />
        ))}
      </div>
    </div>
  );
}
