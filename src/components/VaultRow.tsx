"use client";

import Image from "next/image";
import { useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { useVault } from "@/lib/useVault";
import { fmtAPY, fmtUnits, phaseLabel } from "@/lib/format";
import { VaultStrategyModal } from "./VaultStrategyModal";

/**
 * Single row in the /vaults table. Columns: Vault, APY, TVL, Asset,
 * My position, Status, Actions. Status reflects the *vault* phase
 * (Closed / Funding / Custody / Withdrawals open) — not the loan status.
 *
 * The single "View strategy" action button opens a modal with deposit /
 * withdraw on the left and the loan description + economics on the right.
 */
const COL_TEMPLATE =
  "grid lg:grid-cols-[1.7fr_.55fr_.95fr_.55fr_.95fr_170px_auto] gap-4";

export function VaultRow({ address }: { address: Address }) {
  const { address: account } = useAccount();
  const { vault, isLoading } = useVault(address, account);
  const [modalOpen, setModalOpen] = useState(false);

  const description = vault?.loan?.description;
  const name = vault?.name ?? "—";
  const apy = vault?.loan ? fmtAPY(vault.loan.rateBps, vault.loan.termDays) : "—";
  const tvl = vault ? `$${fmtUnits(vault.totalAssets, vault.decimals)}` : "—";
  const cap = vault ? `$${fmtUnits(vault.maxDeposits, vault.decimals)}` : "—";
  const phase = vault ? phaseLabel(vault.phase) : "—";
  const position =
    vault && vault.totalSupply > 0n
      ? `$${fmtUnits((vault.shareBalance * vault.totalAssets) / vault.totalSupply, vault.decimals)}`
      : "$0";

  return (
    <>
      <div className={`${COL_TEMPLATE} row-hover hairline items-center border-b px-4 py-4 last:border-0 lg:px-6`}>
        {/* Vault: tooltip + AfriCred logo + name */}
        <div className="flex min-w-0 items-center gap-3">
          {description && (
            <span className="group relative shrink-0">
              <button
                type="button"
                tabIndex={0}
                aria-label="Vault description"
                className="hairline2 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] text-ink3 transition-colors hover:border-accent hover:text-ink"
              >
                i
              </button>
              <span className="hairline2 pointer-events-none absolute left-0 top-full z-30 mt-2 block w-72 max-w-[80vw] whitespace-pre-line rounded-sm border bg-bg2 p-3 text-xs leading-relaxed text-ink2 opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <span className="mb-1 block font-medium text-ink">About this loan</span>
                {description}
              </span>
            </span>
          )}

          <Image
            src="/africred-logo.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full"
          />

          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="block truncate text-left text-[13px] font-medium text-ink hover:text-accent"
            >
              {isLoading ? "Loading…" : name}
            </button>
            {vault?.loan && (
              <div className="mt-0.5 truncate text-[11px] text-ink3">
                {vault.loan.installments > 0
                  ? `${vault.loan.installmentsPaid}/${vault.loan.installments} installments paid`
                  : `${vault.loan.termDays}-day bullet loan`}
              </div>
            )}
          </div>
        </div>

        {/* APY (annualized from flat rate × 365 / termDays) */}
        <div className="hidden text-right lg:block">
          <span className="num font-mono text-[13px] text-accent">{apy}</span>
        </div>

        {/* TVL / cap */}
        <div className="hidden text-right lg:block">
          <div className="num font-mono text-[13px] text-ink">{tvl}</div>
          <div className="num font-mono text-[10px] text-ink3">cap {cap}</div>
        </div>

        {/* Asset */}
        <div className="num hidden font-mono text-[13px] text-ink lg:block">USDC</div>

        {/* My position */}
        <div className="num hidden text-right font-mono text-[13px] text-ink lg:block">{position}</div>

        {/* Status — vault phase, not loan status */}
        <div className="hidden lg:block">
          <PhasePill phase={phase} />
        </div>

        {/* Action — single big button opens the strategy modal */}
        <div className="w-full lg:w-[180px] lg:justify-self-end">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="btn-secondary inline-flex h-9 w-full items-center justify-center rounded-sm text-[12px] font-medium"
          >
            View strategy
          </button>
        </div>
      </div>

      <VaultStrategyModal address={address} open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

function PhasePill({ phase }: { phase: string }) {
  const live = phase === "Funding";
  return <span className={`pill ${live ? "live" : ""}`}>{phase}</span>;
}
