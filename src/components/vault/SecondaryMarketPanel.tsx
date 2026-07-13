"use client";

import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, formatUnits, keccak256 as viemKeccak256, parseUnits, type Address, type Hex } from "viem";
import { useAccount, useChainId, useReadContract, useReadContracts, useSignMessage, useWalletClient } from "wagmi";
import { erc20Abi, sharesEscrowAbi } from "@/lib/abis";
import { SECRET_MATCHING_ADDR, useChainAddresses } from "@/lib/contracts";
import { useAction } from "@/lib/useAction";
import { useSecretDepth } from "@/lib/useSecretDepth";
import {
  SECRETPATH_GATEWAY_ABI,
  SECRETPATH_GATEWAY_BASE_MAINNET,
  SECRETPATH_GATEWAY_BASE_SEPOLIA,
  encryptOrderCall,
} from "@/lib/secretpath";
import { base, baseSepolia } from "wagmi/chains";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

type Side = "sell" | "buy";

interface VaultLike {
  asset: Address;
  decimals: number;
  totalAssets: bigint;
  totalSupply: bigint;
  shareBalance: bigint;
  sharePrice: number;
}

/// Sealed-bid secondary market panel. Renders inside VaultStrategyModal as the
/// Sell or Buy tab. Two responsibilities:
///
///   1. On Base: escrow the seller's shares or the buyer's USDC in SharesEscrow.
///      This is required before an order can appear in the Secret matching book.
///   2. Off-chain: after the on-chain lock succeeds, submit the encrypted order
///      to Secret via the SecretPath gateway (this second step is wired via
///      secretpath.ts; today the direct-Keplr path is the demo default and the
///      SecretPath EVM gateway path is deferred).
///
/// The panel degrades gracefully when either the escrow contract or the Secret
/// matching contract is not configured — the tab still shows the design and a
/// clear "not deployed yet" message instead of failing silently.
export function SecondaryMarketPanel({
  side,
  vault,
  vaultAddress,
  refetch,
}: {
  side: Side;
  vault: VaultLike;
  vaultAddress: Address;
  refetch: () => void;
}) {
  const { address: account } = useAccount();
  const { sharesEscrow } = useChainAddresses();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const { signMessageAsync } = useSignMessage();
  const escrowConfigured = Boolean(sharesEscrow);
  const depth = useSecretDepth(vaultAddress);
  const [encryptedTxHash, setEncryptedTxHash] = useState<string | null>(null);
  const [encryptingError, setEncryptingError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");

  const isSell = side === "sell";
  const escrow = useAction(refetch);

  const parsedAmount = safeParse(amount, vault.decimals);
  const parsedPrice = safeParse(price, 6); // USDC / share priced e6

  // Cost in USDC (buyer side) = amount × price / 10^decimals × 10^6 / 10^6.
  // Because both are Uint6 in decimal terms, cost = amount * price_e6 / 10^decimals.
  const costUsdc =
    parsedAmount === 0n || parsedPrice === 0n
      ? 0n
      : (parsedAmount * parsedPrice) / 10n ** BigInt(vault.decimals);

  // On Base we need: seller approves share tokens, buyer approves USDC.
  const spendToken = isSell ? vaultAddress : vault.asset;
  const spendAmount = isSell ? parsedAmount : costUsdc;

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: spendToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account ?? ZERO, sharesEscrow ?? ZERO],
    query: { enabled: Boolean(account && sharesEscrow), refetchInterval: 15_000 },
  });
  const allowance = (allowanceData as bigint | undefined) ?? 0n;

  const { data: escrowBalances, refetch: refetchEscrow } = useReadContracts({
    allowFailure: false,
    contracts: sharesEscrow
      ? [
          {
            address: sharesEscrow,
            abi: sharesEscrowAbi,
            functionName: "sharesLocked",
            args: [vaultAddress, account ?? ZERO],
          },
          {
            address: sharesEscrow,
            abi: sharesEscrowAbi,
            functionName: "usdcLocked",
            args: [vaultAddress, account ?? ZERO],
          },
        ]
      : [],
    query: { enabled: Boolean(account && sharesEscrow), refetchInterval: 15_000 },
  });
  const [sharesLocked, usdcLocked] = (escrowBalances as [bigint, bigint] | undefined) ?? [0n, 0n];

  const navShare = vault.sharePrice; // USDC per share
  const priceNum = Number(price || "0");
  const pctOfNav = navShare > 0 && priceNum > 0 ? (priceNum / navShare) * 100 : undefined;

  const needsApproval = spendAmount > 0n && allowance < spendAmount;

  // Cadence: 4 h. Countdown is best-effort — computed against the local clock,
  // but this display is decorative and re-synced when the Secret query returns.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const secondsToClose =
    depth.epochEndsAt !== undefined ? Math.max(0, depth.epochEndsAt - now) : undefined;

  async function handleSubmit() {
    if (!account || !sharesEscrow) return;
    if (spendAmount === 0n) return;

    if (needsApproval) {
      await escrow.run({
        address: spendToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [sharesEscrow, spendAmount],
      });
      refetchAllowance();
      return;
    }

    if (isSell) {
      await escrow.run({
        address: sharesEscrow,
        abi: sharesEscrowAbi,
        functionName: "lockShares",
        args: [vaultAddress, spendAmount],
      });
    } else {
      await escrow.run({
        address: sharesEscrow,
        abi: sharesEscrowAbi,
        functionName: "lockUsdc",
        args: [vaultAddress, spendAmount],
      });
    }
    refetchAllowance();
    refetchEscrow();

    // Second leg: encrypted order to the Secret matching contract via SecretPath.
    // The lock above only escrows collateral on Base; without this second tx
    // the order never reaches the book. Both must land for the flow to be
    // complete. Failure here is surfaced but doesn't unwind the Base lock —
    // user can Release to recover.
    setEncryptedTxHash(null);
    setEncryptingError(null);
    try {
      if (!walletClient) throw new Error("Wallet client unavailable");
      const gatewayAddr =
        chainId === base.id
          ? SECRETPATH_GATEWAY_BASE_MAINNET
          : chainId === baseSepolia.id
            ? SECRETPATH_GATEWAY_BASE_SEPOLIA
            : null;
      if (!gatewayAddr) throw new Error(`SecretPath gateway not known for chain ${chainId}`);

      const argsJson = JSON.stringify({
        vault: vaultAddress,
        side: isSell ? "ask" : "bid",
        amount_shares: parsedAmount.toString(),
        price_e6: parsedPrice.toString(),
      });

      const packet = await encryptOrderCall({
        handle: isSell ? "submit_order" : "submit_order",
        argsJson,
        userBaseAddress: account,
        personalSign: async (hashHex) => signMessageAsync({ message: { raw: hashHex } }),
        keccak256: (bytes) => viemKeccak256(bytes),
        callbackAddress: gatewayAddr as `0x${string}`,
        callbackSelector: "0x00000000",
      });

      // _routingInfo is the target Secret contract, NOT the SecretPath gateway
      // (the gateway is `to:` on the tx itself). Passing the gateway here made
      // the relayer see no valid Secret target and drop the message.
      if (!SECRET_MATCHING_ADDR) throw new Error("Secret matching contract not configured");
      const data = encodeFunctionData({
        abi: SECRETPATH_GATEWAY_ABI,
        functionName: "send",
        args: [packet.payloadHash, account, SECRET_MATCHING_ADDR, packet.info],
      });

      const hash = await walletClient.sendTransaction({
        to: gatewayAddr as `0x${string}`,
        data: data as Hex,
        value: 100_000_000_000_000n, // ~0.0001 ETH for callback gas allowance
      });
      setEncryptedTxHash(hash);
    } catch (err) {
      setEncryptingError(err instanceof Error ? err.message : String(err));
    }

    setAmount("");
    setPrice("");
  }

  async function handleRelease(kind: "shares" | "usdc") {
    if (!account || !sharesEscrow) return;
    const bal = kind === "shares" ? sharesLocked : usdcLocked;
    if (bal === 0n) return;
    await escrow.run({
      address: sharesEscrow,
      abi: sharesEscrowAbi,
      functionName: kind === "shares" ? "releaseShares" : "releaseUsdc",
      args: [vaultAddress, bal],
    });
    refetchEscrow();
  }

  const buttonLabel = !account
    ? "Connect wallet"
    : !escrowConfigured
      ? "Escrow contract not deployed"
      : spendAmount === 0n
        ? isSell
          ? "Enter shares and minimum price"
          : "Enter shares and maximum price"
        : needsApproval
          ? isSell
            ? "Approve shares"
            : "Approve USDC"
          : isSell
            ? "Lock shares and submit ask"
            : "Lock USDC and submit bid";

  return (
    <div className="space-y-5">
      {/* Amount + price inputs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          label={isSell ? "Amount to sell" : "Amount to buy"}
          unit="SHARES"
          value={amount}
          onChange={setAmount}
          disabled={!account}
        />
        <FormField
          label={isSell ? "Minimum price" : "Maximum price"}
          unit="USDC / SHARE"
          value={price}
          onChange={setPrice}
          disabled={!account}
        />
      </div>

      {/* NAV helper */}
      <div className="hairline rounded-md border bg-bg2 px-3 py-2 text-[11.5px] leading-relaxed text-ink2">
        Current NAV: <strong className="text-ink">{navShare.toFixed(4)} USDC / share</strong>
        {pctOfNav !== undefined && (
          <>
            {" · "}Your {isSell ? "ask" : "bid"} is{" "}
            <strong className="text-ink">{pctOfNav.toFixed(1)}% of NAV</strong>
          </>
        )}
        <div className="mt-1 text-ink3">
          Batch clears every 4 hours at a uniform price for all matched trades.
        </div>
      </div>

      {/* Book depth */}
      <BookDepth depth={depth} />

      {/* Escrow balances (only if user has anything locked) */}
      {(sharesLocked > 0n || usdcLocked > 0n) && (
        <div className="hairline rounded-md border bg-bg2 p-3">
          <div className="eyebrow mb-2 !text-[10px]">Your escrow</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div>
              <div className="text-ink3">Shares locked</div>
              <div className="num mt-0.5 text-ink">
                {formatUnits(sharesLocked, vault.decimals)}
              </div>
              {sharesLocked > 0n && (
                <button
                  type="button"
                  className="link-accent mt-1 text-[11px]"
                  onClick={() => handleRelease("shares")}
                >
                  Release shares
                </button>
              )}
            </div>
            <div>
              <div className="text-ink3">USDC locked</div>
              <div className="num mt-0.5 text-ink">
                {formatUnits(usdcLocked, vault.decimals)}
              </div>
              {usdcLocked > 0n && (
                <button
                  type="button"
                  className="link-accent mt-1 text-[11px]"
                  onClick={() => handleRelease("usdc")}
                >
                  Release USDC
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Countdown + CTA */}
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[11px] text-ink2">
          {secondsToClose !== undefined ? (
            <>
              Next clear in <strong className="text-accent">{fmtCountdown(secondsToClose)}</strong>
            </>
          ) : (
            <span className="text-ink3">Batch cadence: 4h</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            !account ||
            !escrowConfigured ||
            spendAmount === 0n ||
            escrow.pending
          }
          className="btn-accent inline-flex h-10 items-center justify-center rounded-md px-4 text-[13px] font-medium"
        >
          {escrow.pending ? "…" : buttonLabel}
        </button>
      </div>

      {escrow.error && (
        <p className="break-words text-[11px] text-negative">{escrow.error}</p>
      )}

      {encryptedTxHash && (
        <div className="hairline rounded-md border border-positive/30 bg-positive/[0.06] p-3 text-[12px]">
          <div className="font-medium text-positive">Encrypted order broadcast to SecretPath</div>
          <a
            className="link-accent mt-1 inline-block font-mono text-[11px]"
            href={`https://sepolia.basescan.org/tx/${encryptedTxHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {encryptedTxHash.slice(0, 12)}...{encryptedTxHash.slice(-8)} ↗
          </a>
          <p className="mt-1 text-ink3">
            Relayer typically lands the order in Secret&apos;s book within ~30-60 seconds.
          </p>
        </div>
      )}

      {encryptingError && (
        <div className="hairline rounded-md border border-negative/30 bg-negative/[0.06] p-3 text-[11.5px]">
          <div className="font-medium text-negative">Encrypted leg failed</div>
          <p className="mt-1 break-words text-ink2">{encryptingError}</p>
          <p className="mt-1 text-ink3">
            Your Base collateral is still locked — use &quot;Release {isSell ? "shares" : "USDC"}&quot; to recover.
          </p>
        </div>
      )}

      {/* Status: what has to happen after Base lock */}
      <div className="hairline rounded-md border bg-bg2 p-3 text-[11.5px] leading-relaxed text-ink2">
        <div className="eyebrow mb-1 !text-[10px]">How this works</div>
        <ol className="ml-4 list-decimal space-y-1 text-ink2">
          <li>Lock your {isSell ? "shares" : "USDC"} on Base via SharesEscrow.</li>
          <li>Encrypted order goes to the AfriCred matching contract on Secret Network.</li>
          <li>Every 4 hours, matched trades clear at a uniform price.</li>
          <li>The Gateway settles the trade back on Base; you release your proceeds.</li>
        </ol>
        {!depth.configured && (
          <div className="mt-2 text-accent">
            Secret matching contract not deployed yet. Base-side lock still works for testing;
            orders won&apos;t reach the book until Week-2 deploy completes.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- helpers

function safeParse(v: string, decimals: number): bigint {
  if (!v) return 0n;
  try {
    return parseUnits(v as `${number}`, decimals);
  } catch {
    return 0n;
  }
}

function fmtCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}

function FormField({
  label,
  unit,
  value,
  onChange,
  disabled,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow mb-1 !text-[10px]">{label}</div>
      <div className="hairline flex items-baseline gap-2 rounded-md border bg-bg px-3 py-2">
        <input
          className="num min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-ink3"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <span className="font-mono text-[10.5px] tracking-wider text-ink3">{unit}</span>
      </div>
    </div>
  );
}

function BookDepth({ depth }: { depth: ReturnType<typeof useSecretDepth> }) {
  const topAsks = useMemo(() => depth.depth?.asks.slice(0, 4) ?? [], [depth.depth]);
  const topBids = useMemo(() => depth.depth?.bids.slice(0, 4) ?? [], [depth.depth]);

  if (!depth.configured) {
    return (
      <div className="hairline rounded-md border bg-bg2 p-3 text-center text-[11.5px] text-ink3">
        Secret matching contract not deployed yet — book depth will populate after Week-2 launch.
      </div>
    );
  }
  if (depth.loading && !depth.depth) {
    return (
      <div className="hairline rounded-md border bg-bg2 p-3 text-center text-[11.5px] text-ink3">
        Loading book depth…
      </div>
    );
  }
  if (depth.error) {
    return (
      <div className="hairline rounded-md border bg-bg2 p-3 text-center text-[11.5px] text-negative">
        Could not load depth: {depth.error}
      </div>
    );
  }

  return (
    <div className="hairline overflow-hidden rounded-md border">
      <div className="grid grid-cols-2 gap-px bg-rule">
        <SideBook heading="Bids depth" rows={topBids} side="bid" />
        <SideBook heading="Asks depth" rows={topAsks} side="ask" />
      </div>
    </div>
  );
}

function SideBook({
  heading,
  rows,
  side,
}: {
  heading: string;
  rows: { price_e6: string; amount_shares: string }[];
  side: "bid" | "ask";
}) {
  return (
    <div className={`space-y-1 p-2.5 ${side === "bid" ? "bg-bg2" : "bg-bg"}`}>
      <div className="eyebrow !text-[9.5px]">{heading}</div>
      {rows.length === 0 ? (
        <div className="py-1 text-[11px] text-ink3">No resting orders.</div>
      ) : (
        rows.map((r, i) => (
          <div key={i} className="flex justify-between font-mono text-[11.5px]">
            <span className="num text-ink">{formatE6(r.price_e6)}</span>
            <span className="num text-ink2">{formatShareUnits(r.amount_shares)}</span>
          </div>
        ))
      )}
    </div>
  );
}

function formatE6(v: string): string {
  const n = Number(v) / 1_000_000;
  return n.toFixed(4);
}

function formatShareUnits(v: string): string {
  // shares stored with 6 decimals like USDC
  const n = Number(v) / 1_000_000;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
