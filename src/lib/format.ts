import { formatUnits } from "viem";

export function shortAddr(addr?: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function fmtUnits(value?: bigint, decimals = 6, maxFractionDigits = 2) {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, decimals));
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

export function fmtBps(bps?: bigint | number) {
  if (bps === undefined) return "—";
  return `${Number(bps) / 100}%`;
}

/** Human label for the repayment schedule. type 0 = at maturity, 1 = periodic. */
export function fmtRepayment(type?: number, intervalDays?: bigint | number) {
  if (type === undefined) return "—";
  if (type === 0) return "At maturity";
  const d = Number(intervalDays ?? 0);
  if (d === 7) return "Weekly";
  if (d === 14 || d === 15) return `Every ${d} days`;
  if (d === 30) return "Monthly";
  if (d === 90) return "Quarterly";
  return `Every ${d} days`;
}

export function fmtDate(ts?: bigint | number) {
  if (!ts) return "—";
  const n = Number(ts);
  if (n === 0) return "—";
  return new Date(n * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export type VaultPhase = "closed" | "fundingScheduled" | "funding" | "fundingEnded" | "investing" | "withdrawals";

export function phaseLabel(phase: VaultPhase) {
  switch (phase) {
    case "funding":
      return "Funding";
    case "fundingScheduled":
      return "Funding soon";
    case "fundingEnded":
      return "Funding ended";
    case "investing":
      return "Investing";
    case "withdrawals":
      return "Withdrawals open";
    default:
      return "Closed";
  }
}

/** Derive the lifecycle phase from the on-chain state enum + funding window.
 *  state: 0 Closed, 1 Funding, 2 Investing, 3 OpenWithdrawal. */
export function derivePhase(state: number, fundingStart: bigint, fundingEnd: bigint): VaultPhase {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (state === 1) {
    if (now < fundingStart) return "fundingScheduled";
    if (now >= fundingEnd) return "fundingEnded";
    return "funding";
  }
  if (state === 2) return "investing";
  if (state === 3) return "withdrawals";
  return "closed";
}
