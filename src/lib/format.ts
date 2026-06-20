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

/** Format basis points as a percentage string. For loan rates this is a flat rate (e.g. 1500 → "15%"). */
export function fmtBps(bps?: bigint | number) {
  if (bps === undefined) return "—";
  return `${Number(bps) / 100}%`;
}

/**
 * Annualize a flat loan rate (in bps) over the loan's term and format as APY.
 * Simple (non-compounding) annualization: rate × 365 / termDays. Matches how
 * fixed-term private credit is typically quoted to LPs.
 */
export function fmtAPY(bps?: bigint | number, termDays?: number) {
  if (bps === undefined || !termDays || termDays === 0) return "—";
  const flatPct = Number(bps) / 100;
  const apy = (flatPct * 365) / termDays;
  return `${apy.toFixed(2)}%`;
}

/** Returns true if the given unix-timestamp due date is in the past. */
export function isOverdue(nextDueDate?: bigint | number): boolean {
  if (!nextDueDate || Number(nextDueDate) === 0) return false;
  return Date.now() / 1000 > Number(nextDueDate);
}

/** Repayment type label. 0 bullet, 1 interest-periodic, 2 amortizing. */
export function fmtRepayment(type?: number, installments?: number) {
  if (type === undefined) return "—";
  if (type === 0) return "Bullet — at maturity";
  const n = installments ?? 0;
  const label = n > 0 ? `${n} installments` : "installments";
  if (type === 1) return `Interest in ${label}, principal at maturity`;
  if (type === 2) return `Amortizing — ${label}`;
  return "—";
}

/** Risk label. 0 Low, 1 Medium, 2 High. */
export function fmtRisk(risk?: number) {
  switch (risk) {
    case 0:
      return "Low";
    case 1:
      return "Medium";
    case 2:
      return "High";
    default:
      return "—";
  }
}

/** Loan status label. 0 Active, 1 Repaying, 2 Repaid, 3 Defaulted. */
export function fmtLoanStatus(status?: number) {
  switch (status) {
    case 0:
      return "Active";
    case 1:
      return "Repaying";
    case 2:
      return "Repaid";
    case 3:
      return "Defaulted";
    default:
      return "—";
  }
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

export type VaultPhase = "closed" | "funding" | "custody" | "withdrawals";

export function phaseLabel(phase: VaultPhase) {
  switch (phase) {
    case "funding":
      return "Funding";
    case "custody":
      return "Custody";
    case "withdrawals":
      return "Withdrawals open";
    default:
      return "Closed";
  }
}

/** Derive the lifecycle phase from the on-chain state enum.
 *  state: 0 Closed, 1 Funding, 2 Custody, 3 OpenWithdrawal. */
export function derivePhase(state: number): VaultPhase {
  if (state === 1) return "funding";
  if (state === 2) return "custody";
  if (state === 3) return "withdrawals";
  return "closed";
}
