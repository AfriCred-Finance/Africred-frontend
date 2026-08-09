"use client";

import { useCallback, useEffect, useState } from "react";
import { useChainId, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { formatUnits, type Address } from "viem";
import { bsc } from "wagmi/chains";
import { composerAbi, erc20Abi, vaultAbi } from "@/lib/abis";
import { bridgeSourceFor, homeChainFor, useChainAddresses } from "@/lib/contracts";
import {
  loadOrdersForVault,
  orderStatusFrom,
  orderStatusLabel,
  removeOrder,
  type OrderStatus,
  type TrackedOrder,
} from "@/lib/crossChainOrders";
import { shortError } from "@/lib/useCrossChainDeposit";
import { mergeOrders, useDiscoveredOrders } from "@/lib/useDiscoveredOrders";
import { fmtUnits } from "@/lib/format";
import { wagmiConfig } from "@/lib/wagmi";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Resolve cross-chain deposits that did not complete in one pass.
 *
 * The composer never reverts on a business condition — a deposit that arrives outside the
 * vault's funding window, over its cap, or without gas for the return bridge is held as a
 * claimable order instead. This panel is where the LP acts on that. Without it those funds
 * are technically recoverable and practically invisible.
 *
 * Every action here is a write to the composer on the home chain, so the panel prompts a
 * chain switch rather than failing when the wallet is still on the source chain.
 */
export function CrossChainOrdersPanel({ vault, account }: { vault: Address; account?: Address }) {
  const home = useChainAddresses();
  const [local, setLocal] = useState<TrackedOrder[]>([]);
  const [manualGuid, setManualGuid] = useState("");

  // Storage is only readable client-side, so hydrate after mount.
  const reload = useCallback(() => setLocal(loadOrdersForVault(account, vault)), [account, vault]);
  useEffect(reload, [reload]);

  // Chain state is the real record; storage is just a cache that survives one browser.
  const discovered = useDiscoveredOrders(home.chainId, account, vault);
  const orders = mergeOrders(local, discovered.orders);

  const manual = manualGuid.trim();
  const manualValid = /^0x[0-9a-fA-F]{64}$/.test(manual);
  const manualIsNew = manualValid && !orders.some((o) => o.guid.toLowerCase() === manual.toLowerCase());

  if (!account || !home.composer) return null;

  const hasNothing = orders.length === 0 && !discovered.isLoading;

  return (
    <div className="card p-5">
      <div className="text-sm font-medium">Cross-chain deposits</div>
      <p className="mt-1 text-xs text-muted">
        Read from the source chain and from this browser. Live status for each one comes from the composer on{" "}
        {home.chainName}.
      </p>

      {discovered.isLoading && orders.length === 0 && (
        <p className="mt-3 text-[11.5px] text-muted">Checking the source chain…</p>
      )}

      {hasNothing && <p className="mt-3 text-[11.5px] text-muted">No cross-chain deposits found for this vault.</p>}

      <div className="mt-4 space-y-3">
        {orders.map((o) => (
          <OrderRow key={o.guid} order={o} composer={home.composer as Address} onChange={reload} />
        ))}
      </div>

      {discovered.truncated && (
        <p className="mt-3 text-[11.5px] text-accent">
          Only recent history was readable from the source chain, so a deposit older than that will not appear here.
          Paste its message id below to load it directly.
        </p>
      )}
      {discovered.error && <p className="mt-3 text-[11.5px] text-muted">{discovered.error}</p>}

      {/* Last resort. A guid cannot be derived from an address, so an LP who sent a deposit
          outside this app, or beyond the readable range, needs a way in by hand. */}
      <div className="hairline mt-5 border-t pt-4">
        <label className="label">Recover by message id</label>
        <input
          className="input font-mono text-[11px]"
          placeholder="0x…"
          value={manualGuid}
          onChange={(e) => setManualGuid(e.target.value)}
          spellCheck={false}
        />
        {manual.length > 0 && !manualValid && (
          <p className="mt-1 text-[11px] text-muted">A message id is 32 bytes: 0x followed by 64 hex characters.</p>
        )}
        {manualValid && !manualIsNew && (
          <p className="mt-1 text-[11px] text-muted">That deposit is already listed above.</p>
        )}
        {manualIsNew && (
          <div className="mt-3">
            <OrderRow
              order={{
                guid: manual as `0x${string}`,
                vault,
                receiver: account,
                srcChainId: bsc.id,
                homeChainId: home.chainId,
                amount: "—",
                tokenSymbol: "",
                txHash: "0x" as `0x${string}`,
                bridgeBack: false,
                createdAt: 0,
              }}
              composer={home.composer as Address}
              onChange={reload}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function OrderRow({
  order,
  composer,
  onChange,
}: {
  order: TrackedOrder;
  composer: Address;
  onChange: () => void;
}) {
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source = bridgeSourceFor(order.srcChainId);
  const home = homeChainFor(order.homeChainId);
  const onHomeChain = chainId === order.homeChainId;

  const { data, refetch } = useReadContract({
    address: composer,
    abi: composerAbi,
    functionName: "getOrder",
    args: [order.guid],
    chainId: order.homeChainId,
    // An in-transit order flips status without any action from us, so keep polling.
    query: { refetchInterval: 15000 },
  });

  const { data: maxBridgeFee } = useReadContract({
    address: composer,
    abi: composerAbi,
    functionName: "maxBridgeFee",
    chainId: order.homeChainId,
  });

  const onchain = data as
    | {
        token: Address;
        amount: bigint;
        shares: bigint;
        status: number;
      }
    | undefined;

  // A parked order holds two different things in two different decimal domains, and they
  // are not interchangeable: `amount` is the stable (6 for USDC) while `shares` follow the
  // vault (6 for AfriCredVault, 12 for SettlementVault's offset shares). Using one figure
  // for both renders a SettlementVault balance off by 1e6.
  const { data: shareDecimals } = useReadContract({
    address: order.vault,
    abi: vaultAbi,
    functionName: "decimals",
    chainId: order.homeChainId,
  });

  // Read the held token itself rather than the vault asset, so this stays correct when a
  // zap ran and the parked token is not what the vault ultimately takes.
  const { data: tokenDecimals } = useReadContract({
    address: onchain?.token,
    abi: erc20Abi,
    functionName: "decimals",
    chainId: order.homeChainId,
    query: { enabled: Boolean(onchain?.token && onchain.token !== ZERO) },
  });

  const shareDp = shareDecimals ?? 6;
  const tokenDp = tokenDecimals ?? 6;

  const status: OrderStatus = onchain ? orderStatusFrom(onchain.status) : "none";
  const meta = orderStatusLabel(status);

  /// `retryBridge` is payable and the rest are not, so they cannot share one call site
  /// without losing wagmi's type checking on `value`. This wraps the common part instead.
  async function run(key: string, exec: () => Promise<`0x${string}`>) {
    setError(null);
    setBusy(key);
    try {
      const hash = await exec();
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: order.homeChainId });
      await refetch();
      onChange();
    } catch (e: unknown) {
      setError(shortError(e));
    } finally {
      setBusy(null);
    }
  }

  const act = (fn: "retryDeposit" | "claimRefund" | "claimShares") =>
    run(fn, () =>
      writeContractAsync({
        address: composer,
        abi: composerAbi,
        functionName: fn,
        args: [order.guid],
        chainId: order.homeChainId,
      }),
    );

  const payBridgeFee = (value: bigint) =>
    run("retryBridge", () =>
      writeContractAsync({
        address: composer,
        abi: composerAbi,
        functionName: "retryBridge",
        args: [order.guid],
        chainId: order.homeChainId,
        value,
      }),
    );

  const toneClass =
    meta.tone === "action" ? "text-accent" : meta.tone === "done" ? "text-positive" : "text-muted";

  return (
    <div className="hairline rounded-sm border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[12.5px]">
          <span className="font-medium">
            {order.amount} {order.tokenSymbol}
          </span>
          <span className="text-muted"> from {source?.chainName ?? `chain ${order.srcChainId}`}</span>
        </div>
        <span className={`text-[11.5px] ${toneClass}`}>{meta.label}</span>
      </div>

      <p className="mt-1 text-[11px] text-muted">{meta.hint}</p>

      {status === "pending" && onchain && onchain.amount > 0n && (
        <div className="mt-1 text-[11px] text-muted">Held for you: {fmtUnits(onchain.amount, tokenDp, 4)}</div>
      )}
      {status === "awaitingBridge" && onchain && onchain.shares > 0n && (
        <div className="mt-1 text-[11px] text-muted">Shares waiting: {fmtUnits(onchain.shares, shareDp, 4)}</div>
      )}

      {status !== "none" && status !== "settled" && status !== "refunded" && (
        <div className="mt-3">
          {!onHomeChain ? (
            <button
              type="button"
              className="btn"
              disabled={switching}
              onClick={() => switchChain({ chainId: order.homeChainId })}
            >
              {switching ? "Switching…" : `Switch to ${home?.chainName ?? "home chain"} to act`}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {status === "pending" && (
                <>
                  <button className="btn btn-primary" disabled={busy !== null} onClick={() => act("retryDeposit")}>
                    {busy === "retryDeposit" ? "Retrying…" : "Retry deposit"}
                  </button>
                  <button className="btn" disabled={busy !== null} onClick={() => act("claimRefund")}>
                    {busy === "claimRefund" ? "Refunding…" : "Refund me"}
                  </button>
                </>
              )}
              {status === "awaitingBridge" && (
                <>
                  <button
                    className="btn btn-primary"
                    disabled={busy !== null || maxBridgeFee === undefined}
                    onClick={() => payBridgeFee(maxBridgeFee as bigint)}
                    title={
                      maxBridgeFee !== undefined
                        ? `Sends up to ${formatUnits(maxBridgeFee as bigint, 18)} native to cover the bridge fee`
                        : undefined
                    }
                  >
                    {busy === "retryBridge" ? "Bridging…" : "Pay bridge fee"}
                  </button>
                  <button className="btn" disabled={busy !== null} onClick={() => act("claimShares")}>
                    {busy === "claimShares" ? "Claiming…" : `Keep shares on ${home?.chainName ?? "home chain"}`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 break-words text-[11px] text-red-700/80">{error}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-muted">
        <span className="break-all font-mono">{order.guid.slice(0, 18)}…</span>
        {source && (
          <a className="underline" href={`${source.explorer}/tx/${order.txHash}`} target="_blank" rel="noreferrer">
            source tx
          </a>
        )}
        <a className="underline" href={`https://layerzeroscan.com/tx/${order.txHash}`} target="_blank" rel="noreferrer">
          delivery
        </a>
        {(status === "settled" || status === "refunded") && (
          <button
            type="button"
            className="underline"
            onClick={() => {
              removeOrder(order.guid);
              onChange();
            }}
          >
            dismiss
          </button>
        )}
      </div>
    </div>
  );
}
