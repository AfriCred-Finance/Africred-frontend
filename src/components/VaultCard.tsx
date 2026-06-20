"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { useVault } from "@/lib/useVault";
import { useDossierFiles } from "@/hooks/useDossierFiles";
import { useHiddenVaults } from "@/lib/hiddenVaults";
import { EXPLORER } from "@/lib/contracts";
import { fmtUnits, fmtBps, fmtRepayment, fmtLoanStatus, phaseLabel, shortAddr } from "@/lib/format";
import { ipfsToHttp } from "@/lib/ipfs";
import { PhaseBadge } from "./Stat";
import { VaultManageSection } from "./vault/VaultManagePanels";

function DossierLinks({ dossierURI }: { dossierURI?: string }) {
  const { files, loading, fallbackUrl } = useDossierFiles(dossierURI);

  if (!dossierURI) return <span className="text-muted">—</span>;
  if (loading) return <span className="text-muted">Loading…</span>;

  if (files && files.length > 0) {
    return (
      <ul className="space-y-1">
        {files.map((f) => (
          <li key={f.uri}>
            <a
              className="text-ink underline hover:no-underline"
              href={f.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {f.name}
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <a
      className="break-all text-ink underline hover:no-underline"
      href={fallbackUrl ?? ipfsToHttp(dossierURI)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      View dossier
    </a>
  );
}

function LoanMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

export function VaultCard({
  address,
  manageable = false,
  wide = false,
  highlight = false,
}: {
  address: Address;
  manageable?: boolean;
  wide?: boolean;
  highlight?: boolean;
}) {
  const { address: account } = useAccount();
  const { vault, refetch } = useVault(address, account);
  const [expanded, setExpanded] = useState(false);
  const { isHidden, toggle: toggleHidden } = useHiddenVaults();
  const hidden = isHidden(address);
  const loan = vault?.loan;
  const rootRef = useRef<HTMLDivElement>(null);

  // Auto-expand + scroll into view when this vault is highlighted (e.g. just-created).
  useEffect(() => {
    if (!highlight) return;
    setExpanded(true);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [highlight]);

  return (
    <div
      ref={rootRef}
      className={`card p-5 transition-colors ${highlight ? "border-accent/40 ring-1 ring-accent/30" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`/vault/${address}`} className="truncate font-medium tracking-tight hover:underline">
            {vault?.name ?? "Loading…"}
          </Link>
          {manageable && hidden && (
            <span className="rounded-full border border-rule2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink3">
              Hidden
            </span>
          )}
        </div>
        {vault && <PhaseBadge phase={fmtLoanStatus(vault.loan?.status)} />}
      </div>

      <a
        href={`${EXPLORER}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-block font-mono text-xs text-muted hover:text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        {shortAddr(address)}
      </a>

      {loan?.description && (
        <p className="mt-2 line-clamp-2 text-sm text-muted">{loan.description}</p>
      )}

      <div
        className={`mt-4 grid gap-3 ${wide ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      >
        <LoanMetric
          label="Principal"
          value={loan ? `$${fmtUnits(loan.principal, vault?.decimals)}` : "—"}
        />
        <LoanMetric label="Interest rate" value={loan ? fmtBps(loan.rateBps) : "—"} />
        <LoanMetric label="Repayment" value={loan ? fmtRepayment(loan.repaymentType, loan.installments) : "—"} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <LoanMetric label="Loan term" value={loan ? `${loan.termDays} days` : "—"} />
        <LoanMetric label="Repaid" value={loan ? `$${fmtUnits(loan.amountRepaid, vault?.decimals)}` : "—"} />
        <LoanMetric label="Dossier" value={<DossierLinks dossierURI={loan?.dossierURI} />} />
      </div>

      {manageable && vault && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Hide management" : "Manage"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => toggleHidden(address)}
              title="Hide or show this vault on the public /vaults page (saved in this browser)."
            >
              {hidden ? "Show on /vaults" : "Hide from /vaults"}
            </button>
          </div>
          {expanded && (
            <div className="mt-4 border-t border-line pt-4">
              <VaultManageSection
                vault={vault}
                address={address}
                account={account}
                refetch={refetch}
                wide={wide}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
