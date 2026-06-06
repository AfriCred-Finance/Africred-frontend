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

export function fmtDate(ts?: bigint | number) {
  if (!ts) return "—";
  const n = Number(ts);
  if (n === 0) return "—";
  return new Date(n * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export type VaultPhase = "no-epoch" | "funding" | "active" | "settled";

export function phaseLabel(phase: VaultPhase) {
  switch (phase) {
    case "funding":
      return "Funding";
    case "active":
      return "Active";
    case "settled":
      return "Settled";
    default:
      return "No epoch";
  }
}

/** Derive the lifecycle phase from on-chain flags + timestamps. */
export function derivePhase(args: {
  started: boolean;
  custodied: boolean;
  isFunding: boolean;
  isInEpoch: boolean;
  epochStart: bigint;
}): VaultPhase {
  if (!args.started && args.epochStart === 0n) return "no-epoch";
  if (args.isFunding) return "funding";
  if (args.isInEpoch || args.custodied) return "active";
  return "settled";
}
