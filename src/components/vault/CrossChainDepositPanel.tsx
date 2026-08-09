"use client";

import { useMemo, useState } from "react";
import { useReadContract, useReadContracts, useSwitchChain } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { composerAbi, erc20Abi, vaultAbi } from "@/lib/abis";
import {
  bridgeSourcesForHome,
  useBridgeSource,
  useChainAddresses,
  type BridgeSource,
} from "@/lib/contracts";
import { saveOrder } from "@/lib/crossChainOrders";
import { useBridgeQuote, useGatewayReady, useSubmitCrossChainDeposit, type DepositOrderInput } from "@/lib/useCrossChainDeposit";
import { fmtUnits } from "@/lib/format";
import type { VaultData } from "@/components/vault/VaultManagePanels";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const SLIPPAGE_OPTIONS = [
  { label: "0.1%", bps: 10n },
  { label: "0.5%", bps: 50n },
  { label: "1%", bps: 100n },
] as const;

/**
 * Deposit into a Base vault from another chain, BNB Chain first.
 *
 * Renders in one of two modes depending on where the wallet is. On a home chain it is a
 * short prompt with a switch button. On a bridge source chain it is the real form.
 *
 * The vault itself always lives on the home chain, so every vault read here is pinned to
 * that chain explicitly rather than following the wallet.
 */
export function CrossChainDepositPanel({
  vault,
  address,
  account,
}: {
  vault: VaultData;
  address: Address;
  account?: Address;
}) {
  const home = useChainAddresses();
  const source = useBridgeSource();
  const sources = bridgeSourcesForHome(home.chainId);

  // On a home chain, offer the hop only if a source is actually configured.
  if (!source) {
    if (sources.length === 0) return null;
    return <SwitchToSourcePrompt sources={sources} />;
  }

  // Wallet is on a bridge source, but one that deposits into a different home chain.
  if (source.home.chainId !== home.chainId) return null;

  return <CrossChainDepositForm vault={vault} address={address} account={account} source={source} />;
}

function SwitchToSourcePrompt({ sources }: { sources: readonly BridgeSource[] }) {
  const { switchChain, isPending } = useSwitchChain();
  return (
    <div className="card p-5">
      <div className="text-sm font-medium">Deposit from another chain</div>
      <p className="mt-2 text-xs text-muted">
        Hold USDC on BNB Chain? You can fund this vault without moving assets to Base first. Shares are minted on Base
        in the same delivery.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {sources.map((c) => (
          <button
            key={c.chainId}
            type="button"
            className="btn"
            disabled={isPending}
            onClick={() => switchChain({ chainId: c.chainId })}
          >
            {isPending ? "Switching…" : `Switch to ${c.chainName}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The cross-chain deposit form itself.
 *
 * `bare` drops the card wrapper and the vault-name header so the form can be embedded in a
 * surface that already provides them, like the strategy modal. Exported as
 * `CrossChainDepositForm` so both entry points run the exact same flow rather than a
 * near-copy that drifts.
 */
export function CrossChainDepositForm({
  vault,
  address,
  account,
  source,
  bare = false,
}: {
  vault: VaultData;
  address: Address;
  account?: Address;
  source: BridgeSource;
  bare?: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [bridgeBack, setBridgeBack] = useState(false);
  const [slippageBps, setSlippageBps] = useState<bigint>(50n);
  const [sent, setSent] = useState<{ guid: `0x${string}`; txHash: `0x${string}` } | null>(null);

  const home = source.home;
  const { submit, stage, error, setError } = useSubmitCrossChainDeposit();
  const gatewayReady = useGatewayReady(source);

  const decimals = source.bridgeTokenDecimals;
  const amountWei = useMemo(() => {
    if (!amount.trim()) return 0n;
    try {
      return parseUnits(amount.trim(), decimals);
    } catch {
      return 0n;
    }
  }, [amount, decimals]);

  // Source-chain reads: what the LP holds and what the gateway is allowed to take.
  const { data: tokenData, refetch: refetchToken } = useReadContracts({
    allowFailure: false,
    contracts:
      source.bridgeToken && source.gateway
        ? [
            {
              address: source.bridgeToken,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [account ?? ZERO],
              chainId: source.chainId,
            },
            {
              address: source.bridgeToken,
              abi: erc20Abi,
              functionName: "allowance",
              args: [account ?? ZERO, source.gateway],
              chainId: source.chainId,
            },
          ]
        : [],
    query: { enabled: Boolean(account && source.bridgeToken && source.gateway), refetchInterval: 10000 },
  });
  const [balance, allowance] = (tokenData as [bigint, bigint] | undefined) ?? [undefined, undefined];

  // Home-chain reads. Both prevent a deposit that is guaranteed to park on arrival.
  const { data: shareBridge } = useReadContract({
    address: home.composer,
    abi: composerAbi,
    functionName: "shareBridges",
    args: [address],
    chainId: home.chainId,
    query: { enabled: Boolean(home.composer) },
  });
  const canBridgeBack = Boolean(shareBridge && shareBridge !== ZERO);

  const { data: whitelisted } = useReadContract({
    address,
    abi: vaultAbi,
    functionName: "isDepositorWhitelisted",
    args: [account ?? ZERO],
    chainId: home.chainId,
    query: { enabled: Boolean(account && vault.whitelistEnabled) },
  });
  const blockedByWhitelist = vault.whitelistEnabled && whitelisted === false;

  /**
   * The home-chain floor, derived rather than guessed.
   *
   * Both bridge legs normalise through 6 shared decimals, so the amount landing on the
   * home chain is the source amount rescaled between the two token decimals: 18 on BNB
   * Chain against 6 on Base. Getting this wrong by a factor of 1e12 would either be a
   * no-op floor or park every deposit, so it is computed, not approximated.
   */
  const order: DepositOrderInput | undefined = useMemo(() => {
    if (!account) return undefined;
    return {
      vault: address,
      receiver: account,
      minAssetsOut: 0n,
      minSharesOut: 0n,
      bridgeBack: bridgeBack && canBridgeBack,
    };
  }, [account, address, bridgeBack, canBridgeBack]);

  const quote = useBridgeQuote(source, amountWei, order);

  const toHomeUnits = (v: bigint) => (v * 10n ** BigInt(vault.decimals)) / 10n ** BigInt(decimals);
  const afterSlippage = (v: bigint) => (v * (10_000n - slippageBps)) / 10_000n;

  const minBridgedOut = quote.amountToLand !== undefined ? afterSlippage(quote.amountToLand) : 0n;
  const expectedHome = quote.amountToLand !== undefined ? toHomeUnits(quote.amountToLand) : undefined;
  const minAssetsOut = expectedHome !== undefined ? afterSlippage(expectedHome) : 0n;

  const insufficient = balance !== undefined && amountWei > balance;
  const ready = gatewayReady !== false;
  const canSubmit =
    Boolean(account) &&
    amountWei > 0n &&
    !insufficient &&
    !blockedByWhitelist &&
    ready &&
    quote.nativeFee !== undefined &&
    stage === "idle";

  async function onSubmit() {
    if (!order || !account || quote.nativeFee === undefined) return;
    const result = await submit({
      source,
      amount: amountWei,
      minBridgedOut,
      nativeFee: quote.nativeFee,
      // minSharesOut stays 0 deliberately. The meaningful protection is minAssetsOut,
      // which bounds what the bridge and any home-chain swap can take. A hard share
      // floor on top of it mostly risks parking a deposit the LP wanted filled.
      order: { ...order, minAssetsOut },
      allowance,
    });
    if (result) {
      saveOrder({
        guid: result.guid,
        vault: address,
        receiver: account,
        srcChainId: source.chainId,
        homeChainId: home.chainId,
        amount: amount.trim(),
        tokenSymbol: source.bridgeTokenSymbol,
        txHash: result.txHash,
        bridgeBack: order.bridgeBack,
        createdAt: Date.now(),
      });
      setSent(result);
      setAmount("");
      refetchToken();
    }
  }

  if (sent) {
    return <DepositSubmitted source={source} sent={sent} onDone={() => setSent(null)} />;
  }

  return (
    <div className={bare ? "" : "card p-5"}>
      {!bare && (
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Deposit from {source.chainName}</div>
          {source.isTestnet && <span className="text-[11px] text-accent">testnet</span>}
        </div>
      )}
      <div className={`text-xs text-muted ${bare ? "mb-1" : "mt-1"}`}>
        Depositing from {source.chainName}. Wallet:{" "}
        {balance !== undefined ? `${fmtUnits(balance, decimals, 4)} ${source.bridgeTokenSymbol}` : "—"} · settles on{" "}
        {home.chainName}
      </div>

      {gatewayReady === false && (
        <Notice tone="warn">
          The gateway on this chain has no composer configured yet, so deposits will be rejected. This needs an admin
          call to <code>setComposer</code>.
        </Notice>
      )}

      {blockedByWhitelist && (
        <Notice tone="warn">
          This vault gates deposits by allow-list and your address is not on it. A deposit would arrive and then sit
          waiting rather than being filled, so get added first.
        </Notice>
      )}

      {!vault.depositsOpen && (
        <Notice tone="warn">
          This vault is not in its funding window. A deposit sent now would arrive and wait, recoverable by you but not
          filled. Consider waiting until funding opens.
        </Notice>
      )}

      <div className="mt-5">
        <label className="label">Amount ({source.bridgeTokenSymbol})</label>
        <div className="flex gap-2">
          <input
            className="input"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
          />
          <button
            type="button"
            className="btn whitespace-nowrap"
            disabled={balance === undefined || balance === 0n}
            onClick={() => balance !== undefined && setAmount(formatUnits(balance, decimals))}
          >
            Max
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          {source.bridgeTokenSymbol} here is {decimals}-decimal, against {vault.decimals} on {home.chainName}. The
          bridge can only carry whole units of its shared precision, so anything finer is returned to you in the same
          transaction.
        </p>
      </div>

      <div className="mt-4">
        <label className="label">Slippage tolerance</label>
        <div className="flex gap-2">
          {SLIPPAGE_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setSlippageBps(o.bps)}
              className={`hairline rounded-sm border px-3 py-1.5 text-[12px] transition-colors ${
                slippageBps === o.bps ? "border-accent text-accent" : "text-muted hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Enforced on-chain as a floor on what the bridge delivers, not just shown here.
        </p>
      </div>

      <label className="mt-4 flex items-start gap-2 text-[12.5px]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={bridgeBack && canBridgeBack}
          disabled={!canBridgeBack}
          onChange={(e) => setBridgeBack(e.target.checked)}
        />
        <span className={canBridgeBack ? "text-ink" : "text-muted"}>
          Send shares back to {source.chainName}
          <span className="block text-[11px] text-muted">
            {canBridgeBack
              ? `Costs an extra bridge hop. Shares on ${source.chainName} are a claim: redeeming means bridging them back to ${home.chainName}.`
              : `Not available for this vault yet, so shares will be minted to your address on ${home.chainName}.`}
          </span>
        </span>
      </label>

      <div className="hairline mt-5 space-y-1.5 rounded-sm border p-3 text-[12px]">
        <Row label="Debited" value={quote.amountToSend !== undefined ? `${fmtUnits(quote.amountToSend, decimals, 4)} ${source.bridgeTokenSymbol}` : "—"} />
        {quote.dust > 0n && (
          <Row label="Returned as dust" value={`${fmtUnits(quote.dust, decimals, 8)} ${source.bridgeTokenSymbol}`} />
        )}
        <Row
          label={`Expected on ${home.chainName}`}
          value={expectedHome !== undefined ? `$${fmtUnits(expectedHome, vault.decimals)}` : "—"}
        />
        <Row
          label="Minimum accepted"
          value={minAssetsOut > 0n ? `$${fmtUnits(minAssetsOut, vault.decimals)}` : "—"}
        />
        <Row
          label="Bridge fee"
          value={
            quote.nativeFee !== undefined ? `${Number(formatUnits(quote.nativeFee, 18)).toFixed(5)} ${source.nativeSymbol}` : "—"
          }
        />
        <Row label="Shares land on" value={bridgeBack && canBridgeBack ? source.chainName : home.chainName} />
      </div>

      {quote.error && <Notice tone="warn">Could not quote this deposit: {quote.error}</Notice>}
      {insufficient && <Notice tone="warn">That is more than your {source.bridgeTokenSymbol} balance.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <button className="btn btn-primary mt-4 w-full" disabled={!canSubmit} onClick={onSubmit}>
        {stage === "approve"
          ? "Approving…"
          : stage === "deposit"
            ? "Bridging…"
            : quote.isLoading
              ? "Quoting…"
              : `Deposit from ${source.chainName}`}
      </button>

      <p className="mt-2 text-[11px] text-muted">
        Bridging takes a few minutes. If the vault will not accept the deposit when it arrives, it is held for you on{" "}
        {home.chainName}, where you can retry it or take a refund.
      </p>
    </div>
  );
}

function DepositSubmitted({
  source,
  sent,
  onDone,
}: {
  source: BridgeSource;
  sent: { guid: `0x${string}`; txHash: `0x${string}` };
  onDone: () => void;
}) {
  return (
    <div className="card p-5">
      <div className="text-sm font-medium">Deposit sent from {source.chainName}</div>
      <p className="mt-2 text-xs text-muted">
        It should land on {source.home.chainName} within a few minutes. Track it under Cross-chain deposits below.
      </p>

      <div className="hairline mt-4 space-y-2 rounded-sm border p-3 text-[12px]">
        <div>
          <div className="text-muted">Message id</div>
          <div className="mt-0.5 break-all font-mono text-[11px]">{sent.guid}</div>
          <div className="mt-1 text-[11px] text-muted">
            Keep this. It is the only handle on the deposit if it needs a retry or a refund, and it cannot be looked up
            from your address.
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-[12px]">
        <a className="underline" href={`${source.explorer}/tx/${sent.txHash}`} target="_blank" rel="noreferrer">
          Source transaction
        </a>
        <a className="underline" href={`https://layerzeroscan.com/tx/${sent.txHash}`} target="_blank" rel="noreferrer">
          Delivery status
        </a>
      </div>

      <button className="btn mt-4 w-full" onClick={onDone}>
        Send another
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Notice({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  const cls = tone === "error" ? "text-red-700/80" : "text-accent";
  return <p className={`mt-3 text-[11.5px] ${cls}`}>{children}</p>;
}
