"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { keccak256, parseUnits, formatUnits, stringToBytes } from "viem";
import type { Address } from "viem";
import { erc20Abi, settlementVaultAbi } from "@/lib/abis";
import { useChainAddresses } from "@/lib/contracts";
import { useAction } from "@/lib/useAction";
import { Stat } from "@/components/Stat";

const REFETCH_MS = 10_000;

function fmtUsdc(v?: bigint) {
  if (v === undefined) return "—";
  const num = Number(formatUnits(v, 6));
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtBps(bps?: bigint) {
  if (bps === undefined) return "—";
  return `${Number(bps) / 100}%`;
}

function shortAddr(a?: string) {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtOrderRef(input: string): `0x${string}` {
  const trimmed = input.trim();
  if (trimmed.startsWith("0x") && trimmed.length === 66) return trimmed as `0x${string}`;
  return keccak256(stringToBytes(trimmed));
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-2 break-words text-xs text-red-700/80">{error}</p>;
}

export default function SettlementPage() {
  const { settlementVault, usdc, chainName, explorer } = useChainAddresses();
  const { address: account } = useAccount();

  const { data: vaultState, refetch: refetchState } = useReadContracts({
    contracts: settlementVault
      ? [
          { address: settlementVault, abi: settlementVaultAbi, functionName: "totalAssets" },
          { address: settlementVault, abi: settlementVaultAbi, functionName: "outstanding" },
          { address: settlementVault, abi: settlementVaultAbi, functionName: "availableLiquidity" },
          { address: settlementVault, abi: settlementVaultAbi, functionName: "assetsOwedTotal" },
          { address: settlementVault, abi: settlementVaultAbi, functionName: "totalSupply" },
          { address: settlementVault, abi: settlementVaultAbi, functionName: "drawCapBps" },
          { address: settlementVault, abi: settlementVaultAbi, functionName: "paused" },
          { address: settlementVault, abi: settlementVaultAbi, functionName: "depositsPaused" },
          { address: settlementVault, abi: settlementVaultAbi, functionName: "allocator" },
          { address: settlementVault, abi: settlementVaultAbi, functionName: "owner" },
          { address: settlementVault, abi: settlementVaultAbi, functionName: "nextClaimId" },
          { address: settlementVault, abi: settlementVaultAbi, functionName: "queueLength" },
        ]
      : [],
    query: { enabled: Boolean(settlementVault), refetchInterval: REFETCH_MS },
  });

  const totalAssets = vaultState?.[0]?.result as bigint | undefined;
  const outstanding = vaultState?.[1]?.result as bigint | undefined;
  const availableLiquidity = vaultState?.[2]?.result as bigint | undefined;
  const assetsOwedTotal = vaultState?.[3]?.result as bigint | undefined;
  const totalSupply = vaultState?.[4]?.result as bigint | undefined;
  const drawCapBps = vaultState?.[5]?.result as bigint | undefined;
  const paused = vaultState?.[6]?.result as boolean | undefined;
  const depositsPaused = vaultState?.[7]?.result as boolean | undefined;
  const allocator = vaultState?.[8]?.result as Address | undefined;
  const owner = vaultState?.[9]?.result as Address | undefined;
  const nextClaimId = vaultState?.[10]?.result as bigint | undefined;
  const queueLength = vaultState?.[11]?.result as bigint | undefined;

  const isAllocator = Boolean(account && allocator && account.toLowerCase() === allocator.toLowerCase());
  const isOwner = Boolean(account && owner && account.toLowerCase() === owner.toLowerCase());

  const { data: userState, refetch: refetchUser } = useReadContracts({
    contracts:
      settlementVault && account && usdc
        ? [
            { address: settlementVault, abi: settlementVaultAbi, functionName: "balanceOf", args: [account] },
            { address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [account] },
            { address: usdc, abi: erc20Abi, functionName: "allowance", args: [account, settlementVault] },
          ]
        : [],
    query: { enabled: Boolean(settlementVault && account && usdc), refetchInterval: REFETCH_MS },
  });

  const shareBalance = userState?.[0]?.result as bigint | undefined;
  const usdcBalance = userState?.[1]?.result as bigint | undefined;
  const usdcAllowance = userState?.[2]?.result as bigint | undefined;

  const { data: userAssets } = useReadContract({
    address: settlementVault,
    abi: settlementVaultAbi,
    functionName: "convertToAssets",
    args: shareBalance !== undefined ? [shareBalance] : undefined,
    query: { enabled: Boolean(settlementVault && shareBalance !== undefined) },
  });

  const refetchAll = () => {
    refetchState();
    refetchUser();
  };

  const utilizationPct =
    totalAssets && totalAssets > 0n && outstanding !== undefined
      ? (Number(outstanding) / Number(totalAssets)) * 100
      : 0;
  const capPct = drawCapBps !== undefined ? Number(drawCapBps) / 100 : 0;

  if (!settlementVault) {
    return (
      <div className="mx-auto max-w-content px-6 py-14 lg:px-12">
        <p className="text-sm text-ink2">
          No Settlement Vault is configured for {chainName}. Set NEXT_PUBLIC_SEPOLIA_SETTLEMENT_VAULT_ADDRESS or the
          mainnet equivalent.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Header — compact eyebrow + title, meta on the right */}
      <section className="hairline relative overflow-hidden border-b">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-content px-6 py-10 lg:px-12 lg:py-14">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="eyebrow !text-[10px]">Settlement vault</div>
              <h1 className="mt-2 text-3xl font-light tracking-[-0.02em] lg:text-4xl">Trade settlement pool</h1>
              <p className="mt-2 max-w-xl text-sm text-ink2">
                LPs deposit USDC; the allocator draws to pre-finance orders and repays with spread. Withdrawals hit
                the reserve first; anything above queues 24h FIFO.
              </p>
              <a
                href={`${explorer}/address/${settlementVault}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block font-mono text-xs text-muted hover:text-ink"
              >
                {shortAddr(settlementVault)} · {chainName}
              </a>
            </div>
            <div className="flex flex-col items-end gap-2 font-mono text-xs text-ink2">
              <div className="flex gap-2">
                {paused ? <span className="tag border-red-500/40 text-red-700">Paused</span> : null}
                {!paused && depositsPaused ? (
                  <span className="tag border-amber-500/40 text-amber-700">Deposits paused</span>
                ) : null}
              </div>
              <MetaRow label="Cap" value={fmtBps(drawCapBps)} />
              <MetaRow label="Owner" value={shortAddr(owner)} />
              <MetaRow label="Allocator" value={shortAddr(allocator)} />
            </div>
          </div>
        </div>
      </section>

      {/* Pool state */}
      <section className="hairline border-b">
        <div className="mx-auto max-w-content px-6 py-10 lg:px-12">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-ink2">Pool state</h2>
            <div className="font-mono text-[11px] text-ink3">Refreshes every 10s</div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total assets" value={`$${fmtUsdc(totalAssets)}`} sub="LP equity" />
            <Stat label="Outstanding" value={`$${fmtUsdc(outstanding)}`} sub="Drawn, unrepaid" />
            <Stat label="Reserve" value={`$${fmtUsdc(availableLiquidity)}`} sub="Instant withdrawals" />
            <Stat label="Queued" value={`$${fmtUsdc(assetsOwedTotal)}`} sub="Awaiting claim" />
          </div>

          {/* Utilization bar */}
          <div className="card mt-4 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="text-xs uppercase tracking-wider text-muted">Utilization</div>
              <div className="font-mono text-xs">
                <span className="text-ink">{utilizationPct.toFixed(1)}%</span>
                <span className="text-ink3"> / cap {capPct.toFixed(0)}%</span>
              </div>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-bg2">
              <div
                className="absolute left-0 top-0 h-full bg-accent transition-all"
                style={{ width: `${Math.min(utilizationPct, 100)}%` }}
              />
              <div
                className="absolute top-0 h-full w-px bg-ink/40"
                style={{ left: `${Math.min(capPct, 100)}%` }}
                title={`Draw cap ${capPct.toFixed(0)}%`}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat
              label="Share supply"
              value={fmtUsdc(totalSupply ? totalSupply / 1_000_000n : undefined)}
              sub="afSV (12 decimals)"
            />
            <Stat
              label="Queue"
              value={queueLength !== undefined ? String(queueLength) : "—"}
              sub={`next claim: #${nextClaimId?.toString() ?? "—"}`}
            />
            <Stat label="Cooldown" value="24h" sub="request → claim" />
          </div>
        </div>
      </section>

      {/* LP panel */}
      <section className="hairline border-b">
        <div className="mx-auto max-w-content px-6 py-10 lg:px-12">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-ink2">Liquidity provider</h2>
          {!account ? (
            <div className="card p-6 text-center">
              <p className="text-sm text-ink2">Connect a wallet to deposit or withdraw.</p>
            </div>
          ) : (
            <LpPanel
              vault={settlementVault}
              usdc={usdc}
              account={account}
              usdcBalance={usdcBalance}
              usdcAllowance={usdcAllowance}
              shareBalance={shareBalance}
              userAssetsHeld={userAssets as bigint | undefined}
              availableLiquidity={availableLiquidity}
              depositsClosed={Boolean(paused) || Boolean(depositsPaused)}
              onSuccess={refetchAll}
            />
          )}
        </div>
      </section>

      {/* Queue */}
      <QueueSection
        vault={settlementVault}
        queueLength={queueLength}
        nextClaimId={nextClaimId}
        onClaim={refetchAll}
        explorer={explorer}
      />

      {(isAllocator || isOwner) && (
        <AdminSection
          vault={settlementVault}
          usdc={usdc}
          usdcAllowance={usdcAllowance}
          paused={paused}
          depositsPaused={depositsPaused}
          isAllocator={isAllocator}
          isOwner={isOwner}
          onSuccess={refetchAll}
        />
      )}
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-ink3">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

// ============================================================ LP panel

function LpPanel({
  vault,
  usdc,
  account,
  usdcBalance,
  usdcAllowance,
  shareBalance,
  userAssetsHeld,
  availableLiquidity,
  depositsClosed,
  onSuccess,
}: {
  vault: Address;
  usdc: Address;
  account: Address;
  usdcBalance?: bigint;
  usdcAllowance?: bigint;
  shareBalance?: bigint;
  userAssetsHeld?: bigint;
  availableLiquidity?: bigint;
  depositsClosed?: boolean;
  onSuccess: () => void;
}) {
  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");

  const approveA = useAction(onSuccess);
  const depositA = useAction(() => {
    setDepositAmt("");
    onSuccess();
  });
  const withdrawA = useAction(() => {
    setWithdrawAmt("");
    onSuccess();
  });
  const requestA = useAction(() => {
    setWithdrawAmt("");
    onSuccess();
  });

  const depositUnits = useMemo(() => {
    try {
      return parseUnits(depositAmt || "0", 6);
    } catch {
      return 0n;
    }
  }, [depositAmt]);

  const withdrawUnits = useMemo(() => {
    try {
      return parseUnits(withdrawAmt || "0", 6);
    } catch {
      return 0n;
    }
  }, [withdrawAmt]);

  const needsApproval = depositUnits > 0n && (usdcAllowance ?? 0n) < depositUnits;
  const canInstantWithdraw = withdrawUnits > 0n && withdrawUnits <= (availableLiquidity ?? 0n);

  const { data: sharesToBurn } = useReadContract({
    address: vault,
    abi: settlementVaultAbi,
    functionName: "previewWithdraw",
    args: withdrawUnits > 0n ? [withdrawUnits] : undefined,
    query: { enabled: withdrawUnits > 0n },
  });

  const setMaxDeposit = () => {
    if (usdcBalance) setDepositAmt(formatUnits(usdcBalance, 6));
  };

  const setMaxWithdraw = () => {
    if (userAssetsHeld) setWithdrawAmt(formatUnits(userAssetsHeld, 6));
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Deposit */}
      <div className="card p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="text-xs uppercase tracking-wider text-muted">Deposit USDC</div>
          <button
            type="button"
            className="font-mono text-[11px] text-ink3 hover:text-accent"
            onClick={setMaxDeposit}
            disabled={!usdcBalance}
          >
            Balance: ${fmtUsdc(usdcBalance)}
          </button>
        </div>
        {depositsClosed ? (
          <p className="rounded-[4px] border border-amber-500/40 bg-amber-50/40 px-3 py-2 text-xs text-amber-800">
            Deposits are currently paused by the vault owner. Existing LPs can still withdraw normally.
          </p>
        ) : null}
        <input
          type="number"
          className="input"
          placeholder="0.00"
          value={depositAmt}
          onChange={(e) => setDepositAmt(e.target.value)}
          disabled={depositsClosed}
        />
        <div className="mt-3 flex flex-col gap-2">
          {needsApproval && !depositsClosed ? (
            <button
              className="btn"
              onClick={() =>
                approveA.run({
                  address: usdc,
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [vault, 2n ** 256n - 1n],
                })
              }
              disabled={approveA.pending}
            >
              {approveA.pending ? "Approving…" : "1. Approve USDC"}
            </button>
          ) : null}
          <button
            className="btn-primary"
            onClick={() =>
              depositA.run({
                address: vault,
                abi: settlementVaultAbi,
                functionName: "deposit",
                args: [depositUnits, account],
              })
            }
            disabled={depositA.pending || depositUnits === 0n || needsApproval || depositsClosed}
          >
            {depositA.pending
              ? "Depositing…"
              : depositsClosed
                ? "Deposits paused"
                : needsApproval
                  ? "Approve first"
                  : "Deposit"}
          </button>
        </div>
        <ErrorLine error={approveA.error || depositA.error} />
      </div>

      {/* Withdraw / Request */}
      <div className="card p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="text-xs uppercase tracking-wider text-muted">Withdraw USDC</div>
          <button
            type="button"
            className="font-mono text-[11px] text-ink3 hover:text-accent"
            onClick={setMaxWithdraw}
            disabled={!userAssetsHeld}
          >
            Position: ${fmtUsdc(userAssetsHeld)}
          </button>
        </div>
        <input
          type="number"
          className="input"
          placeholder="0.00"
          value={withdrawAmt}
          onChange={(e) => setWithdrawAmt(e.target.value)}
        />
        <div className="mt-2 font-mono text-[11px] text-ink3">
          Reserve available: ${fmtUsdc(availableLiquidity)} · Shares held:{" "}
          {fmtUsdc(shareBalance ? shareBalance / 1_000_000n : undefined)}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {canInstantWithdraw ? (
            <button
              className="btn-primary"
              onClick={() =>
                withdrawA.run({
                  address: vault,
                  abi: settlementVaultAbi,
                  functionName: "withdraw",
                  args: [withdrawUnits, account, account],
                })
              }
              disabled={withdrawA.pending || withdrawUnits === 0n}
            >
              {withdrawA.pending ? "Withdrawing…" : "Withdraw instantly"}
            </button>
          ) : (
            <>
              {withdrawUnits > 0n && (
                <p className="rounded-[4px] border border-rule bg-bg2/40 px-3 py-2 text-[11px] text-ink2">
                  Reserve too low for instant withdraw. Queue below (24h cooldown, FIFO claim).
                </p>
              )}
              <button
                className="btn"
                onClick={() => {
                  if (sharesToBurn === undefined) return;
                  requestA.run({
                    address: vault,
                    abi: settlementVaultAbi,
                    functionName: "requestWithdrawal",
                    args: [sharesToBurn as bigint],
                  });
                }}
                disabled={requestA.pending || withdrawUnits === 0n}
              >
                {requestA.pending ? "Queuing…" : "Request withdrawal"}
              </button>
            </>
          )}
        </div>
        <ErrorLine error={withdrawA.error || requestA.error} />
      </div>
    </div>
  );
}

// ============================================================ Queue

function QueueSection({
  vault,
  queueLength,
  nextClaimId,
  onClaim,
  explorer,
}: {
  vault: Address;
  queueLength?: bigint;
  nextClaimId?: bigint;
  onClaim: () => void;
  explorer: string;
}) {
  const total = queueLength !== undefined ? Number(queueLength) : 0;
  const from = Math.max(0, total - 8);
  const indices = useMemo(() => {
    const out: bigint[] = [];
    for (let i = from; i < total; i++) out.push(BigInt(i));
    return out;
  }, [from, total]);

  const { data: entries } = useReadContracts({
    contracts: indices.map((i) => ({
      address: vault,
      abi: settlementVaultAbi as unknown as never,
      functionName: "queue" as unknown as never,
      args: [i],
    })),
    query: { enabled: indices.length > 0, refetchInterval: REFETCH_MS },
  });

  const claimA = useAction(onClaim);
  const [claimingId, setClaimingId] = useState<bigint | null>(null);

  return (
    <section className="hairline border-b">
      <div className="mx-auto max-w-content px-6 py-10 lg:px-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-ink2">Withdrawal queue</h2>
          {total > 0 && (
            <div className="font-mono text-[11px] text-ink3">
              Showing last {indices.length} of {total}
            </div>
          )}
        </div>
        {total === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-ink2">No pending withdrawals.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-rule bg-bg2/40">
                <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-ink3">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3 text-right">USDC owed</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {indices.map((idx, i) => {
                  const entry = entries?.[i]?.result as
                    | readonly [Address, bigint, bigint, boolean]
                    | undefined;
                  if (!entry) return null;
                  const [user, owed, at, claimed] = entry;
                  const cooldownEnd = at + 86400n;
                  const now = BigInt(Math.floor(Date.now() / 1000));
                  const isNext = nextClaimId !== undefined && nextClaimId === idx;
                  const cooldownRemaining = cooldownEnd > now ? Number(cooldownEnd - now) : 0;
                  const eligible = isNext && !claimed && cooldownRemaining === 0;
                  const isPast = nextClaimId !== undefined && idx < nextClaimId;

                  return (
                    <tr key={idx.toString()} className="border-t border-rule hover:bg-bg2/30">
                      <td className="px-4 py-3 font-mono text-ink3">{idx.toString()}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`${explorer}/address/${user}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs hover:text-accent"
                        >
                          {shortAddr(user)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">${fmtUsdc(owed)}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink2">
                        {new Date(Number(at) * 1000).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {claimed || isPast ? (
                          <span className="tag border-rule text-ink3">Claimed</span>
                        ) : eligible ? (
                          <button
                            className="btn-accent h-8 px-3 !text-xs"
                            onClick={() => {
                              setClaimingId(idx);
                              claimA
                                .run({
                                  address: vault,
                                  abi: settlementVaultAbi,
                                  functionName: "claim",
                                  args: [idx],
                                })
                                .finally(() => setClaimingId(null));
                            }}
                            disabled={claimA.pending}
                          >
                            {claimA.pending && claimingId === idx ? "Claiming…" : "Claim"}
                          </button>
                        ) : isNext ? (
                          <span className="font-mono text-[11px] text-ink2">
                            Cooldown {fmtDuration(cooldownRemaining)}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-ink3">Queued</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ErrorLine error={claimA.error} />
          </div>
        )}
      </div>
    </section>
  );
}

function fmtDuration(secs: number): string {
  if (secs <= 0) return "ready";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m${(secs % 60).toString().padStart(2, "0")}s`;
  return `${secs}s`;
}

// ============================================================ Allocator

function AllocatorPanel({
  vault,
  usdc,
  usdcAllowance,
  onSuccess,
}: {
  vault: Address;
  usdc: Address;
  usdcAllowance?: bigint;
  onSuccess: () => void;
}) {
  const [drawAmt, setDrawAmt] = useState("");
  const [drawRef, setDrawRef] = useState("");
  const [repayAmt, setRepayAmt] = useState("");
  const [repayRef, setRepayRef] = useState("");

  const drawA = useAction(() => {
    setDrawAmt("");
    setDrawRef("");
    onSuccess();
  });
  const approveA = useAction(onSuccess);
  const repayA = useAction(() => {
    setRepayAmt("");
    setRepayRef("");
    onSuccess();
  });

  const drawUnits = useMemo(() => {
    try {
      return parseUnits(drawAmt || "0", 6);
    } catch {
      return 0n;
    }
  }, [drawAmt]);

  const repayUnits = useMemo(() => {
    try {
      return parseUnits(repayAmt || "0", 6);
    } catch {
      return 0n;
    }
  }, [repayAmt]);

  const needsAllowance = repayUnits > 0n && (usdcAllowance ?? 0n) < repayUnits;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card p-5">
        <div className="mb-3 text-xs uppercase tracking-wider text-muted">Draw USDC</div>
        <input
          type="text"
          className="input"
          placeholder="orderRef (any string or 0x…32B)"
          value={drawRef}
          onChange={(e) => setDrawRef(e.target.value)}
        />
        <input
          type="number"
          className="input mt-2"
          placeholder="Amount USDC"
          value={drawAmt}
          onChange={(e) => setDrawAmt(e.target.value)}
        />
        {drawRef.trim() ? (
          <div className="mt-2 break-all font-mono text-[10px] text-ink3">
            ref → {fmtOrderRef(drawRef)}
          </div>
        ) : null}
        <button
          className="btn-primary mt-3 w-full"
          onClick={() =>
            drawA.run({
              address: vault,
              abi: settlementVaultAbi,
              functionName: "draw",
              args: [drawUnits, fmtOrderRef(drawRef)],
            })
          }
          disabled={drawA.pending || drawUnits === 0n || !drawRef.trim()}
        >
          {drawA.pending ? "Drawing…" : "Draw"}
        </button>
        <ErrorLine error={drawA.error} />
      </div>

      <div className="card p-5">
        <div className="mb-3 text-xs uppercase tracking-wider text-muted">Repay draw</div>
        <input
          type="text"
          className="input"
          placeholder="orderRef used in draw"
          value={repayRef}
          onChange={(e) => setRepayRef(e.target.value)}
        />
        <input
          type="number"
          className="input mt-2"
          placeholder="Total USDC (principal + spread)"
          value={repayAmt}
          onChange={(e) => setRepayAmt(e.target.value)}
        />
        <div className="mt-3 flex flex-col gap-2">
          {needsAllowance ? (
            <button
              className="btn"
              onClick={() =>
                approveA.run({
                  address: usdc,
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [vault, 2n ** 256n - 1n],
                })
              }
              disabled={approveA.pending}
            >
              {approveA.pending ? "Approving…" : "1. Approve USDC"}
            </button>
          ) : null}
          <button
            className="btn-primary"
            onClick={() =>
              repayA.run({
                address: vault,
                abi: settlementVaultAbi,
                functionName: "repay",
                args: [fmtOrderRef(repayRef), repayUnits],
              })
            }
            disabled={repayA.pending || repayUnits === 0n || !repayRef.trim() || needsAllowance}
          >
            {repayA.pending ? "Repaying…" : "Repay"}
          </button>
        </div>
        <ErrorLine error={approveA.error || repayA.error} />
      </div>
    </div>
  );
}

// ============================================================ Owner

function OwnerPanel({
  vault,
  onSuccess,
}: {
  vault: Address;
  onSuccess: () => void;
}) {
  const [woRef, setWoRef] = useState("");
  const [woAmt, setWoAmt] = useState("");
  const [capBps, setCapBps] = useState("");
  const [newAllocator, setNewAllocator] = useState("");

  const woA = useAction(() => {
    setWoRef("");
    setWoAmt("");
    onSuccess();
  });
  const capA = useAction(() => {
    setCapBps("");
    onSuccess();
  });
  const allocA = useAction(() => {
    setNewAllocator("");
    onSuccess();
  });

  const woUnits = useMemo(() => {
    try {
      return parseUnits(woAmt || "0", 6);
    } catch {
      return 0n;
    }
  }, [woAmt]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="card p-5">
        <div className="mb-3 text-xs uppercase tracking-wider text-muted">Write off draw</div>
        <input
          type="text"
          className="input"
          placeholder="orderRef"
          value={woRef}
          onChange={(e) => setWoRef(e.target.value)}
        />
        <input
          type="number"
          className="input mt-2"
          placeholder="Amount to write off"
          value={woAmt}
          onChange={(e) => setWoAmt(e.target.value)}
        />
        <button
          className="btn mt-3 w-full"
          onClick={() =>
            woA.run({
              address: vault,
              abi: settlementVaultAbi,
              functionName: "writeOff",
              args: [fmtOrderRef(woRef), woUnits],
            })
          }
          disabled={woA.pending || woUnits === 0n || !woRef.trim()}
        >
          {woA.pending ? "Writing off…" : "Write off"}
        </button>
        <ErrorLine error={woA.error} />
      </div>

      <div className="card p-5">
        <div className="mb-3 text-xs uppercase tracking-wider text-muted">Set draw cap</div>
        <input
          type="number"
          className="input"
          placeholder="new bps (e.g. 6000 = 60%)"
          value={capBps}
          onChange={(e) => setCapBps(e.target.value)}
        />
        <button
          className="btn mt-3 w-full"
          onClick={() =>
            capA.run({
              address: vault,
              abi: settlementVaultAbi,
              functionName: "setDrawCap",
              args: [BigInt(capBps || "0")],
            })
          }
          disabled={capA.pending || !capBps}
        >
          {capA.pending ? "Setting…" : "Set cap"}
        </button>
        <ErrorLine error={capA.error} />
      </div>

      <div className="card p-5">
        <div className="mb-3 text-xs uppercase tracking-wider text-muted">Rotate allocator</div>
        <input
          type="text"
          className="input"
          placeholder="0x…"
          value={newAllocator}
          onChange={(e) => setNewAllocator(e.target.value)}
        />
        <button
          className="btn mt-3 w-full"
          onClick={() =>
            allocA.run({
              address: vault,
              abi: settlementVaultAbi,
              functionName: "setAllocator",
              args: [newAllocator as Address],
            })
          }
          disabled={allocA.pending || !newAllocator}
        >
          {allocA.pending ? "Setting…" : "Set allocator"}
        </button>
        <ErrorLine error={allocA.error} />
      </div>
    </div>
  );
}

// ============================================================ Pause controls

function PauseControls({
  vault,
  paused,
  depositsPaused,
  onSuccess,
}: {
  vault: Address;
  paused?: boolean;
  depositsPaused?: boolean;
  onSuccess: () => void;
}) {
  const fullA = useAction(onSuccess);
  const depA = useAction(onSuccess);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card p-5">
        <div className="mb-3 text-xs uppercase tracking-wider text-muted">Full pause</div>
        <p className="text-sm text-ink2">
          {paused ? (
            <>
              Vault is <span className="font-medium text-red-700">fully paused</span>. Deposit, withdraw, draw, and
              request are blocked. Claims stay live.
            </>
          ) : (
            <>Emergency stop. Blocks everything except claim on already-queued withdrawals.</>
          )}
        </p>
        <button
          className={`mt-4 w-full ${paused ? "btn-primary" : "btn"}`}
          onClick={() =>
            fullA.run({
              address: vault,
              abi: settlementVaultAbi,
              functionName: paused ? "unpause" : "pause",
            })
          }
          disabled={fullA.pending}
        >
          {fullA.pending ? "…" : paused ? "Unpause" : "Pause"}
        </button>
        <ErrorLine error={fullA.error} />
      </div>

      <div className="card p-5">
        <div className="mb-3 text-xs uppercase tracking-wider text-muted">Deposits-only pause</div>
        <p className="text-sm text-ink2">
          {depositsPaused ? (
            <>
              <span className="font-medium text-amber-700">Deposits blocked</span>. Withdraws, requests, claims, draws,
              and repays stay live. LPs can exit anytime.
            </>
          ) : (
            <>Block new capital while keeping every other operation live. Useful for winding down or capping capacity.</>
          )}
        </p>
        <button
          className={`mt-4 w-full ${depositsPaused ? "btn-primary" : "btn"}`}
          onClick={() =>
            depA.run({
              address: vault,
              abi: settlementVaultAbi,
              functionName: depositsPaused ? "unpauseDeposits" : "pauseDeposits",
            })
          }
          disabled={depA.pending}
        >
          {depA.pending ? "…" : depositsPaused ? "Reopen deposits" : "Pause deposits"}
        </button>
        <ErrorLine error={depA.error} />
      </div>
    </div>
  );
}

// ============================================================ Admin wrapper (tabs)

type AdminTab = "operations" | "admin";

function AdminSection({
  vault,
  usdc,
  usdcAllowance,
  paused,
  depositsPaused,
  isAllocator,
  isOwner,
  onSuccess,
}: {
  vault: Address;
  usdc: Address;
  usdcAllowance?: bigint;
  paused?: boolean;
  depositsPaused?: boolean;
  isAllocator: boolean;
  isOwner: boolean;
  onSuccess: () => void;
}) {
  const tabs: { key: AdminTab; label: string }[] = [{ key: "operations", label: "Operations" }];
  if (isOwner) tabs.push({ key: "admin", label: "Admin" });
  const [active, setActive] = useState<AdminTab>("operations");

  return (
    <section className="hairline border-b">
      <div className="mx-auto max-w-content px-6 py-10 lg:px-12">
        <div className="mb-4 flex items-baseline gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-ink2">Admin</h2>
          <div className="flex gap-2">
            {isAllocator && <span className="tag border-accent/40 text-accent">Allocator</span>}
            {isOwner && <span className="tag border-accent/40 text-accent">Owner</span>}
          </div>
        </div>

        {/* Tab bar */}
        <div className="mb-4 flex gap-1 border-b border-rule">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`relative px-4 py-2 text-sm transition-colors ${
                active === t.key ? "text-ink" : "text-ink3 hover:text-ink2"
              }`}
            >
              {t.label}
              {active === t.key && (
                <span className="absolute inset-x-0 -bottom-px h-px bg-accent" />
              )}
            </button>
          ))}
        </div>

        {active === "operations" && (
          <div className="flex flex-col gap-4">
            {isAllocator && (
              <AllocatorPanel
                vault={vault}
                usdc={usdc}
                usdcAllowance={usdcAllowance}
                onSuccess={onSuccess}
              />
            )}
            {isOwner && (
              <PauseControls
                vault={vault}
                paused={paused}
                depositsPaused={depositsPaused}
                onSuccess={onSuccess}
              />
            )}
          </div>
        )}

        {active === "admin" && isOwner && <OwnerPanel vault={vault} onSuccess={onSuccess} />}
      </div>
    </section>
  );
}
