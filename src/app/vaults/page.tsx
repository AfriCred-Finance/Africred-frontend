"use client";

import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { factoryAbi } from "@/lib/abis";
import { FACTORY_ADDRESS } from "@/lib/contracts";
import { useHiddenVaults } from "@/lib/hiddenVaults";
import { VaultRow } from "@/components/VaultRow";
import { ConfigBanner } from "@/components/ConfigBanner";

export default function VaultsPage() {
  const { data: vaults, isLoading } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "allVaults",
    query: { enabled: Boolean(FACTORY_ADDRESS), refetchInterval: 30000 },
  });

  const { isHidden } = useHiddenVaults();
  const all = (vaults as Address[] | undefined) ?? [];
  const list = all.filter((v) => !isHidden(v));

  return (
    <>
      {/* Page header */}
      <section className="hairline relative overflow-hidden border-b">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-content px-6 py-14 lg:px-12 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-light tracking-[-0.02em] lg:text-5xl">
                Credit vault marketplace
              </h1>
            </div>

            <div className="grid grid-cols-2 gap-x-10 gap-y-2 font-mono">
              <div>
                <div className="eyebrow !text-[10px]">Vaults</div>
                <div className="num mt-1 text-2xl">{String(list.length).padStart(2, "0")}</div>
              </div>
              <div>
                <div className="eyebrow !text-[10px]">Network</div>
                <div className="num mt-1 text-2xl">Base Sepolia</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Vault table */}
      <section className="hairline border-b">
        <div className="mx-auto max-w-content px-6 py-10 lg:px-12 lg:py-14">
          <ConfigBanner />

          <div className="hairline mt-4 overflow-hidden rounded-sm border">
            {/* Table head — desktop only */}
            <div className="eyebrow hairline hidden h-12 grid-cols-[1.7fr_.55fr_.95fr_.55fr_.95fr_170px_auto] items-center gap-4 border-b !text-[10px] bg-bg2/40 px-6 lg:grid">
              <div>Vault</div>
              <div className="text-right">APY</div>
              <div className="text-right">TVL</div>
              <div>Asset</div>
              <div className="text-right">Position</div>
              <div>Status</div>
              <div className="w-[180px]" />
            </div>

            {/* Rows */}
            {!FACTORY_ADDRESS ? (
              <div className="px-6 py-16 text-center text-sm text-ink2">
                Configure the factory address to view vaults.
              </div>
            ) : isLoading ? (
              <div className="px-6 py-16 text-center text-sm text-ink2">Loading vaults…</div>
            ) : list.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm text-ink2">No vaults deployed yet.</p>
                <p className="mt-1 font-mono text-[11px] text-ink3">
                  Create one from the <a className="link-accent" href="/admin">Admin</a> page.
                </p>
              </div>
            ) : (
              <div className="hairline divide-y">
                {list.map((v) => (
                  <VaultRow key={v} address={v} />
                ))}
              </div>
            )}
          </div>

          <p className="mt-4 font-mono text-[12px] text-ink3">
            // APY is annualized from the loan&apos;s flat rate over its term (rate × 365 / days). Open a vault to
            see the full loan economics.
          </p>
        </div>
      </section>
    </>
  );
}
