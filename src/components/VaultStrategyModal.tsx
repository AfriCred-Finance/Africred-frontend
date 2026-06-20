"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { parseUnits, type Address } from "viem";
import { useVault } from "@/lib/useVault";
import { useAction } from "@/lib/useAction";
import { erc20Abi, vaultAbi } from "@/lib/abis";
import { EXPLORER } from "@/lib/contracts";
import {
  fmtAPY,
  fmtBps,
  fmtDate,
  fmtLoanStatus,
  fmtRepayment,
  fmtRisk,
  fmtUnits,
  phaseLabel,
  shortAddr,
} from "@/lib/format";
import { useRepaymentHistory, type RepaymentLog } from "@/lib/useRepaymentHistory";
import { ipfsToHttp } from "@/lib/ipfs";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Vault strategy modal opened from the /vaults table. Layout mirrors the
 * D2 Finance "Alpha Strategies" reference:
 *   ┌─────────────────────────────────────┬──────────────────────────┐
 *   │ Logo · Name · Status                │ Strategy Overview        │
 *   │ TVL · APY · My position             │ Goal (description)       │
 *   │ ┌─ Deposit ─ Withdraw ─┐            │ Loan terms               │
 *   │ │ Input + MAX          │            │   Principal / APY / ...  │
 *   │ │ Wallet bal / Vault bal│            │ Dossier link             │
 *   │ │ Primary action       │            │                          │
 *   └─────────────────────────────────────┴──────────────────────────┘
 *   Lifecycle: Closed → Funding → Custody → Withdrawals open
 */
export function VaultStrategyModal({
  address,
  open,
  onClose,
}: {
  address: Address;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[4px]" />
      <div
        className="hideScrollBar hairline2 relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-md border bg-bg2"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalBody address={address} onClose={onClose} />
      </div>
    </div>
  );
}

function ModalBody({ address, onClose }: { address: Address; onClose: () => void }) {
  const { address: account } = useAccount();
  const { vault, refetch } = useVault(address, account);

  if (!vault) {
    return <div className="p-12 text-center text-sm text-ink2">Loading vault…</div>;
  }

  return (
    <>
      {/* Close button (floats top-right) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="hairline2 absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-sm border bg-bg2 text-ink2 transition-colors hover:border-accent hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>

      {/* Top split: actions | strategy overview */}
      <div className="grid gap-px bg-rule lg:grid-cols-2">
        <ActionsPane vault={vault} address={address} refetch={refetch} />
        <DetailsPane vault={vault} address={address} />
      </div>
    </>
  );
}

// ============================================================ LEFT PANE
type VaultData = NonNullable<ReturnType<typeof useVault>["vault"]>;

function ActionsPane({
  vault,
  address,
  refetch,
}: {
  vault: VaultData;
  address: Address;
  refetch: () => void;
}) {
  const { address: account } = useAccount();
  const deposit = useAction(refetch);
  const redeem = useAction(refetch);

  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");

  const { data: tokenData, refetch: refetchToken } = useReadContracts({
    allowFailure: false,
    contracts: [
      { address: vault.asset, abi: erc20Abi, functionName: "balanceOf", args: [account ?? ZERO] },
      { address: vault.asset, abi: erc20Abi, functionName: "allowance", args: [account ?? ZERO, address] },
    ],
    query: { enabled: Boolean(account), refetchInterval: 8000 },
  });
  const [usdcBal, allowance] = (tokenData as [bigint, bigint] | undefined) ?? [undefined, undefined];

  const refresh = () => {
    refetch();
    refetchToken();
  };

  function safeParse(v: string): bigint {
    try {
      return parseUnits(v as `${number}`, vault.decimals);
    } catch {
      return 0n;
    }
  }

  // Position value in asset units (shares × sharePrice)
  const positionAssets =
    vault.totalSupply > 0n ? (vault.shareBalance * vault.totalAssets) / vault.totalSupply : 0n;

  const isDeposit = tab === "deposit";
  const amountWei = amount ? safeParse(amount) : 0n;
  const needsApproval = isDeposit && allowance !== undefined && amountWei > 0n && allowance < amountWei;
  const canDeposit = vault.depositsOpen;
  const canRedeem = vault.withdrawalsOpen;
  const enabled = (isDeposit && canDeposit) || (!isDeposit && canRedeem);

  function handleMax() {
    if (isDeposit && usdcBal !== undefined) setAmount(rawUnits(usdcBal, vault.decimals));
    // Withdraw is in USDC now (uses ERC4626 `withdraw`), so MAX = full position value in assets.
    if (!isDeposit && positionAssets > 0n) setAmount(rawUnits(positionAssets, vault.decimals));
  }

  function handleSubmit() {
    if (!account || !enabled) return;
    if (isDeposit) {
      if (needsApproval) {
        deposit
          .run({ address: vault.asset, abi: erc20Abi, functionName: "approve", args: [address, amountWei] })
          .then(refresh);
        return;
      }
      deposit
        .run({ address, abi: vaultAbi, functionName: "deposit", args: [amountWei, account] })
        .then(() => {
          setAmount("");
          refresh();
        });
    } else {
      // ERC4626 `withdraw(assets, receiver, owner)` — takes USDC amount, contract
      // figures out the share burn. UX-wise the LP types USDC, not shares.
      redeem
        .run({ address, abi: vaultAbi, functionName: "withdraw", args: [amountWei, account, account] })
        .then(() => {
          setAmount("");
          refresh();
        });
    }
  }

  const pending = isDeposit ? deposit.pending : redeem.pending;
  const error = isDeposit ? deposit.error : redeem.error;

  const buttonLabel = !account
    ? "Connect wallet"
    : !enabled
      ? isDeposit
        ? "Deposits closed"
        : "Withdrawals closed"
      : needsApproval
        ? "Approve USDC"
        : isDeposit
          ? "Deposit"
          : "Redeem";

  return (
    <div className="space-y-5 bg-bg2 p-6">
      {/* Heading: logo + (name + status pill) + explorer link */}
      <div className="flex items-start gap-3">
        <Image src="/africred-logo.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-medium text-ink">{vault.name}</span>
            <span
              className={`pill !px-1.5 !py-0 !text-[9px] !tracking-[0.06em] ${
                vault.phase === "funding" ? "live" : ""
              }`}
            >
              {phaseLabel(vault.phase)}
            </span>
            {vault.loan && (
              <span
                className="pill !px-1.5 !py-0 !text-[9px] !tracking-[0.06em]"
                title={`Risk band: ${fmtRisk(vault.loan.risk)}`}
              >
                {fmtRisk(vault.loan.risk)} risk
              </span>
            )}
          </div>
          <a
            href={`${EXPLORER}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-ink3 transition-colors hover:text-accent"
          >
            <span>{shortAddr(address)}</span>
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3 shrink-0">
              <path d="M4 2h6v6M10 2L4 8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="TVL" value={`$${fmtUnits(vault.totalAssets, vault.decimals)}`} />
        <Stat
          label="APY"
          value={vault.loan ? fmtAPY(vault.loan.rateBps, vault.loan.termDays) : "—"}
          accent
        />
        <Stat label="Position" value={`$${fmtUnits(positionAssets, vault.decimals)}`} />
      </div>

      {/* Segmented tab toggle — pill containing two buttons */}
      <div className="hairline flex rounded-md border bg-bg p-1">
        <SegmentedTab active={isDeposit} onClick={() => { setTab("deposit"); setAmount(""); }}>
          Deposit
        </SegmentedTab>
        <SegmentedTab active={!isDeposit} onClick={() => { setTab("withdraw"); setAmount(""); }}>
          Withdraw
        </SegmentedTab>
      </div>

      {/* Amount input — asset label on the left, number flex, rust MAX chip on the right */}
      <div className="hairline flex items-center gap-3 rounded-md border bg-bg px-3 py-2.5">
        <span className="font-mono text-[12px] text-ink2">USDC</span>
        <input
          className="num min-w-0 flex-1 bg-transparent font-mono text-base outline-none placeholder:text-ink3"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!account || !enabled}
        />
        <button
          type="button"
          onClick={handleMax}
          disabled={!account}
          className="rounded-sm bg-accent px-2.5 py-1 font-mono text-[11px] font-medium tracking-wider text-bg transition-colors hover:bg-accent2 disabled:opacity-40"
        >
          MAX
        </button>
      </div>

      {/* Status rows — key/value list */}
      <div className="space-y-2 text-[12px]">
        <StatusRow
          label="USDC balance"
          value={account && usdcBal !== undefined ? `${fmtUnits(usdcBal, vault.decimals)} USDC` : "—"}
        />
        <StatusRow label="Shares" value={fmtUnits(vault.shareBalance, vault.decimals)} />
        <StatusRow label="Share price" value={`${vault.sharePrice.toFixed(4)} USDC`} />
        {isDeposit ? (
          <StatusRow
            label="Deposit cap remaining"
            value={`${fmtUnits(
              vault.maxDeposits > vault.totalDeposits ? vault.maxDeposits - vault.totalDeposits : 0n,
              vault.decimals,
            )} USDC`}
          />
        ) : (
          <StatusRow
            label="Max withdrawable"
            value={`${fmtUnits(positionAssets, vault.decimals)} USDC`}
          />
        )}
      </div>

      {/* Primary action */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!account || !enabled || pending || (enabled && amountWei === 0n)}
        className="btn-accent inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium"
      >
        {pending ? "…" : buttonLabel}
      </button>
      {error && <p className="break-words text-[11px] text-negative">{error}</p>}

      {/* Risk disclosure */}
      <div className="hairline rounded-md border bg-bg/40 p-3">
        <div className="text-[10px] uppercase tracking-wider text-ink3">Risk</div>
        <p className="mt-1 text-[11px] leading-relaxed text-ink2">
          Single-borrower credit risk. On default, LPs recover only what the originator records via a recovery — no
          insurance fund. NAV is frozen for the duration of custody.
        </p>
      </div>
    </div>
  );
}

// ============================================================ RIGHT PANE
function DetailsPane({ vault, address }: { vault: VaultData; address: Address }) {
  const [tab, setTab] = useState<"overview" | "contract" | "fees">("overview");
  return (
    <div className="space-y-5 bg-bg2 p-6">
      <div className="flex flex-wrap gap-2">
        <TabPill active={tab === "overview"} onClick={() => setTab("overview")} icon={<IconDoc />}>
          Loan Overview
        </TabPill>
        <TabPill active={tab === "contract"} onClick={() => setTab("contract")} icon={<IconContract />}>
          Contract
        </TabPill>
        <TabPill active={tab === "fees"} onClick={() => setTab("fees")} icon={<IconPercent />}>
          Fees
        </TabPill>
      </div>

      {tab === "overview" && <OverviewTab vault={vault} />}
      {tab === "contract" && <ContractTab vault={vault} address={address} />}
      {tab === "fees" && <FeesTab />}
    </div>
  );
}

function OverviewTab({ vault }: { vault: VaultData }) {
  const loan = vault.loan;
  // `title` carries the full text so any cell whose value gets truncated
  // (e.g. the repayment description "Interest in 3 installments, …") reveals
  // the full string on hover via the browser's native tooltip.
  const cells: { label: string; node: React.ReactNode; title?: string }[] = [
    {
      label: "Principal",
      node: loan ? `$${fmtUnits(loan.principal, vault.decimals)}` : "—",
    },
    {
      label: "Interest rate",
      node: loan ? (
        <>
          {fmtBps(loan.rateBps)}{" "}
          <span className="text-[11px] text-accent">({fmtAPY(loan.rateBps, loan.termDays)} APY)</span>
        </>
      ) : (
        "—"
      ),
      title: loan ? `${fmtBps(loan.rateBps)} flat · ${fmtAPY(loan.rateBps, loan.termDays)} APY` : undefined,
    },
    {
      label: "Repayment",
      node: loan ? fmtRepayment(loan.repaymentType, loan.installments) : "—",
      title: loan ? fmtRepayment(loan.repaymentType, loan.installments) : undefined,
    },
    { label: "Loan term", node: loan ? `${loan.termDays} days` : "—" },
    { label: "Repaid", node: loan ? `$${fmtUnits(loan.amountRepaid, vault.decimals)}` : "—" },
    {
      label: "Dossier",
      node: loan?.dossierURI ? (
        <a
          href={ipfsToHttp(loan.dossierURI)}
          target="_blank"
          rel="noreferrer"
          className="link-accent inline-flex items-center gap-1 text-[13px]"
        >
          View dossier
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3">
            <path d="M4 2h6v6M10 2L4 8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      ) : (
        "—"
      ),
      title: loan?.dossierURI || undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-ink">Loan status</div>
          {loan && (
            <span className="pill !px-1.5 !py-0 !text-[9px] !tracking-[0.06em]">
              {fmtLoanStatus(loan.status)}
            </span>
          )}
        </div>
        <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink2">
          {loan?.description || "No description provided for this vault."}
        </p>
      </div>

      <div>
        <div className="text-sm font-medium text-ink">Loan terms</div>
        <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-5">
          {cells.map((c) => (
            <div key={c.label} className="min-w-0">
              <div className="text-[12px] text-ink2">{c.label}</div>
              <div className="num mt-1 truncate text-[13px] text-ink" title={c.title}>
                {c.node}
              </div>
            </div>
          ))}
        </div>
      </div>

      {loan && (
        <RepaymentTimeline
          loan={loan}
          decimals={vault.decimals}
          registry={vault.loanRegistry}
          loanId={vault.loanId}
        />
      )}
    </div>
  );
}

function ContractTab({ vault, address }: { vault: VaultData; address: Address }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-medium text-ink">On-chain references</div>
        <p className="mt-1 text-[12px] text-ink3">Every address is clickable and opens on Basescan.</p>
      </div>

      <div className="hairline rounded-sm border">
        <table className="w-full font-mono text-[11px]">
          <tbody className="hairline divide-y">
            <AddressRow label="Vault" value={address} />
            <AddressRow label="Loan registry" value={vault.loanRegistry} />
            <SimpleRow label="Loan NFT id" value={`#${vault.loanId.toString()}`} />
            <AddressRow label="Asset (USDC)" value={vault.asset} />
            <AddressRow label="Allocator" value={vault.allocator} />
            <AddressRow label="Owner (NFT holder)" value={vault.owner} />
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-ink2">
        The vault is an{" "}
        <span className="font-mono text-[11px] text-ink">ERC-4626</span> token. Shares are also a LayerZero{" "}
        <span className="font-mono text-[11px] text-ink">OFT</span>, so positions can be bridged to other chains.
      </p>
    </div>
  );
}

function FeesTab() {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-medium text-ink">Fee structure</div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink2">
          AfriCred takes <strong className="font-medium text-ink">no protocol fees</strong> on this vault. LPs receive
          100% of borrower repayments minus any default losses.
        </p>
      </div>

      <div className="hairline rounded-sm border">
        <table className="num w-full font-mono text-[12px]">
          <tbody className="hairline divide-y">
            <SimpleRow label="Management fee" value="0%" />
            <SimpleRow label="Performance fee" value="0%" />
            <SimpleRow label="Origination fee" value="0%" />
            <SimpleRow label="Withdrawal fee" value="0%" />
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-ink3">
        A fee model may be introduced in future versions and would be applied per-vault, never retroactively.
      </p>
    </div>
  );
}

// ============================================================ REPAYMENT TIMELINE
type Loan = NonNullable<VaultData["loan"]>;

function RepaymentTimeline({
  loan,
  decimals,
  registry,
  loanId,
}: {
  loan: Loan;
  decimals: number;
  registry: Address;
  loanId: bigint;
}) {
  // Total number of expected payments by repayment type:
  //   bullet (0): one final payment
  //   InterestThenPrincipal (1): N interest installments + 1 principal payment
  //   amortizing (2): N installments
  let total = 1;
  if (loan.repaymentType === 1) total = loan.installments + 1;
  else if (loan.repaymentType === 2) total = loan.installments || 1;

  const installmentsPaid = Number(loan.installmentsPaid);
  const nextDueTs = loan.nextDueDate > 0n ? Number(loan.nextDueDate) : 0;

  // Real per-installment data for already-paid milestones — pulled from
  // `LoanRepaymentRecorded` events. Each log carries the block timestamp + tx hash.
  // Skipped entirely when nothing has been paid yet (no logs to fetch).
  const { logs: history } = useRepaymentHistory(registry, loanId, installmentsPaid);
  // Map installmentsPaid → log so we can look up by index 1..N.
  const logByPaid = new Map<number, RepaymentLog>();
  for (const l of history) logByPaid.set(l.installmentsPaid, l);

  const milestones = Array.from({ length: total }, (_, i) => {
    let status: "paid" | "current" | "future";
    if (i < installmentsPaid) status = "paid";
    else if (i === installmentsPaid) status = "current";
    else status = "future";

    // For paid milestones, look up the log emitted when this installment was recorded.
    // The contract increments installmentsPaid before emitting, so milestone index `i`
    // corresponds to `installmentsPaid = i + 1`.
    const matchingLog = status === "paid" ? logByPaid.get(i + 1) : undefined;
    const date =
      matchingLog && matchingLog.blockTimestamp > 0
        ? fmtDate(matchingLog.blockTimestamp)
        : status === "current" && nextDueTs > 0
          ? fmtDate(nextDueTs)
          : "—";

    // Label + amount per type
    let label: string;
    let amount: bigint;
    if (loan.repaymentType === 0) {
      label = "Bullet";
      amount =
        matchingLog?.amount ?? (loan.nextInstallmentAmount > 0n ? loan.nextInstallmentAmount : loan.principal);
    } else if (loan.repaymentType === 1) {
      if (i === total - 1) {
        label = "Principal";
        amount = matchingLog?.amount ?? loan.principal;
      } else {
        label = `Interest ${i + 1}`;
        amount =
          matchingLog?.amount ??
          (loan.nextInstallmentAmount > 0n
            ? loan.nextInstallmentAmount
            : (loan.principal * loan.rateBps) / 10_000n / BigInt(loan.installments || 1));
      }
    } else {
      label = `Installment ${i + 1}`;
      amount =
        matchingLog?.amount ??
        (loan.nextInstallmentAmount > 0n
          ? loan.nextInstallmentAmount
          : (loan.principal + (loan.principal * loan.rateBps) / 10_000n) / BigInt(total));
    }

    return { label, date, amount, status, txHash: matchingLog?.txHash };
  });

  return (
    <div>
      <div className="text-sm font-medium text-ink">Repayment schedule</div>
      <div className="hairline mt-3 rounded-md border bg-bg p-4">
        {milestones.map((m, i) => {
          const isLast = i === milestones.length - 1;
          // Connecting segment color: rust if THIS milestone is paid, hairline otherwise.
          const segmentClass = m.status === "paid" ? "bg-accent" : "bg-rule";
          return (
            <div key={i} className="flex gap-3">
              {/* Dot + connecting line column */}
              <div className="flex flex-col items-center">
                <MilestoneDot status={m.status} />
                {!isLast && <div className={`my-1 w-px flex-1 ${segmentClass}`} />}
              </div>

              {/* Row content */}
              <div className={`flex flex-1 items-start justify-between ${isLast ? "" : "pb-3"}`}>
                <div className="min-w-0">
                  <div
                    className={`text-[12px] ${
                      m.status === "current"
                        ? "font-medium text-accent"
                        : m.status === "paid"
                          ? "text-ink"
                          : "text-ink3"
                    }`}
                  >
                    {m.label}
                  </div>
                  <div className="num mt-0.5 font-mono text-[10px] text-ink3">{m.date}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end pl-3">
                  <span
                    className={`num font-mono text-[12px] ${
                      m.status === "future" ? "text-ink3" : "text-ink"
                    }`}
                  >
                    ${fmtUnits(m.amount, decimals)}
                  </span>
                  {m.txHash && (
                    <a
                      className="link-accent !text-[10px] !no-underline hover:!underline"
                      href={`${EXPLORER}/tx/${m.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      title={m.txHash}
                    >
                      View tx ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MilestoneDot({ status }: { status: "paid" | "current" | "future" }) {
  if (status === "paid") {
    return (
      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-accent">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-2.5 w-2.5 text-bg">
          <path d="M2.5 6.5L5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (status === "current") {
    return (
      <div className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-accent bg-bg">
        <div className="h-1.5 w-1.5 rounded-full bg-accent" />
      </div>
    );
  }
  return <div className="h-4 w-4 rounded-full border-2 border-rule2 bg-bg" />;
}

// ============================================================ helpers
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink3">{label}</div>
      <div className={`num mt-1 font-mono text-base ${accent ? "text-accent" : "text-ink"}`}>{value}</div>
    </div>
  );
}

function SegmentedTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-sm py-1.5 text-[13px] font-medium transition-colors ${
        active ? "bg-accent text-bg" : "text-ink2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function StatusRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink3">{label}</span>
      {children ?? <span className="num font-mono text-ink">{value}</span>}
    </div>
  );
}

function SimpleRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="px-3 py-2 text-ink3">{label}</td>
      <td className="px-3 py-2 text-right text-ink">{value}</td>
    </tr>
  );
}

function AddressRow({ label, value }: { label: string; value: Address }) {
  return (
    <tr>
      <td className="px-3 py-2 text-ink3">{label}</td>
      <td className="px-3 py-2 text-right">
        <a
          href={`${EXPLORER}/address/${value}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-ink transition-colors hover:text-accent"
        >
          <span>{shortAddr(value)}</span>
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3 shrink-0">
            <path d="M4 2h6v6M10 2L4 8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </td>
    </tr>
  );
}

function TabPill({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
        active
          ? "border-accent/40 bg-accent/15 text-accent"
          : "hairline text-ink2 hover:border-rule2 hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function IconDoc() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3.5 w-3.5">
      <rect x="3" y="2.5" width="10" height="11" rx="1.5" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" strokeLinecap="round" />
    </svg>
  );
}

function IconContract() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3.5 w-3.5">
      <path d="M4 2.5h6l2 2v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" />
      <path d="M10 2.5v2h2" strokeLinejoin="round" />
      <path d="M5.5 9h5M5.5 11h3" strokeLinecap="round" />
    </svg>
  );
}

function IconPercent() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3.5 w-3.5">
      <path d="M4 12l8-8" strokeLinecap="round" />
      <circle cx="5" cy="5" r="1.6" />
      <circle cx="11" cy="11" r="1.6" />
    </svg>
  );
}

function rawUnits(v: bigint, decimals: number): string {
  const s = v.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals) || "0";
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
