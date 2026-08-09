"use client";

import { useCallback, useState } from "react";
import { useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { decodeEventLog, type Address } from "viem";
import { depositGatewayAbi, erc20Abi } from "./abis";
import type { BridgeSource } from "./contracts";
import { wagmiConfig } from "./wagmi";

/** Mirrors the DepositOrder tuple shared by the gateway and the composer. */
export type DepositOrderInput = {
  vault: Address;
  receiver: Address;
  minAssetsOut: bigint;
  minSharesOut: bigint;
  bridgeBack: boolean;
};

export function toOrderTuple(order: DepositOrderInput) {
  return {
    vault: order.vault,
    receiver: order.receiver,
    minAssetsOut: order.minAssetsOut,
    minSharesOut: order.minSharesOut,
    bridgeBack: order.bridgeBack,
  } as const;
}

/**
 * Quote a cross-chain deposit against the gateway.
 *
 * Returns the native fee to attach, the amount that will actually be debited after the
 * bridge truncates dust, and the amount expected to land on the home chain net of the
 * bridge's own fee. All three are in the SOURCE chain's token decimals, which for BNB
 * Chain USDC is 18 rather than Base's 6.
 */
export function useBridgeQuote(source: BridgeSource | undefined, amount: bigint, order: DepositOrderInput | undefined) {
  const enabled = Boolean(source?.gateway && order && amount > 0n);

  const { data, isLoading, error, refetch } = useReadContract({
    address: source?.gateway,
    abi: depositGatewayAbi,
    functionName: "quote",
    args: order ? [amount, toOrderTuple(order)] : undefined,
    chainId: source?.chainId,
    query: { enabled, refetchInterval: 20000, retry: false },
  });

  const [nativeFee, amountToSend, amountToLand] = (data as readonly [bigint, bigint, bigint] | undefined) ?? [
    undefined,
    undefined,
    undefined,
  ];

  return {
    nativeFee,
    amountToSend,
    amountToLand,
    /// Dust the bridge cannot carry. Returned to the sender in the same transaction,
    /// but worth showing so the debited amount is never a surprise.
    dust: amountToSend !== undefined && amount > amountToSend ? amount - amountToSend : 0n,
    isLoading: enabled && isLoading,
    error: error ? shortError(error) : null,
    refetch,
  };
}

/** Is the gateway wired to a composer? An unwired gateway rejects every deposit. */
export function useGatewayReady(source: BridgeSource | undefined) {
  const { data } = useReadContract({
    address: source?.gateway,
    abi: depositGatewayAbi,
    functionName: "composer",
    chainId: source?.chainId,
    query: { enabled: Boolean(source?.gateway) },
  });
  const composer = data as `0x${string}` | undefined;
  if (composer === undefined) return undefined;
  return composer !== `0x${"0".repeat(64)}`;
}

export type SubmitStage = "idle" | "approve" | "deposit";

/**
 * Approve if needed, then send the cross-chain deposit, then pull the LayerZero `guid`
 * out of the receipt.
 *
 * The guid matters more than it looks: the composer keys every recovery path on it and
 * there is no way to look one up from an address. A deposit whose guid is lost is a
 * deposit the LP cannot retry or refund, so this returns it rather than just a tx hash.
 */
export function useSubmitCrossChainDeposit() {
  const { writeContractAsync } = useWriteContract();
  const [stage, setStage] = useState<SubmitStage>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (params: {
      source: BridgeSource;
      amount: bigint;
      minBridgedOut: bigint;
      nativeFee: bigint;
      order: DepositOrderInput;
      allowance: bigint | undefined;
    }): Promise<{ guid: `0x${string}`; txHash: `0x${string}` } | null> => {
      const { source, amount, minBridgedOut, nativeFee, order, allowance } = params;
      if (!source.gateway || !source.bridgeToken) {
        setError("This chain has no deposit gateway configured.");
        return null;
      }

      setError(null);
      try {
        if (allowance !== undefined && allowance < amount) {
          setStage("approve");
          const approveHash = await writeContractAsync({
            address: source.bridgeToken,
            abi: erc20Abi,
            functionName: "approve",
            args: [source.gateway, amount],
            chainId: source.chainId,
          });
          await waitForTransactionReceipt(wagmiConfig, { hash: approveHash, chainId: source.chainId });
        }

        setStage("deposit");
        const txHash = await writeContractAsync({
          address: source.gateway,
          abi: depositGatewayAbi,
          functionName: "deposit",
          args: [amount, minBridgedOut, toOrderTuple(order)],
          value: nativeFee,
          chainId: source.chainId,
        });
        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: txHash, chainId: source.chainId });

        const guid = extractGuid(receipt.logs, source.gateway);
        if (!guid) {
          // The deposit itself succeeded, so do not present this as a failure. But the
          // LP needs the guid, and the source tx is where it can still be read from.
          setError(
            "Deposit sent, but the message id could not be read from the receipt. Keep the transaction hash to recover it.",
          );
          return null;
        }
        return { guid, txHash };
      } catch (e: unknown) {
        setError(shortError(e));
        return null;
      } finally {
        setStage("idle");
      }
    },
    [writeContractAsync],
  );

  return { submit, stage, error, setError };
}

function extractGuid(logs: readonly { address: string; topics: readonly string[]; data: string }[], gateway: Address) {
  const target = gateway.toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== target) continue;
    try {
      const decoded = decodeEventLog({
        abi: depositGatewayAbi,
        topics: log.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
        data: log.data as `0x${string}`,
      });
      if (decoded.eventName === "CrossChainDepositSent") {
        return (decoded.args as unknown as { guid: `0x${string}` }).guid;
      }
    } catch {
      // Not our event; keep scanning. Stargate emits several logs of its own here.
    }
  }
  return undefined;
}

/** Trim viem's multi-paragraph errors down to something a panel can show. */
export function shortError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Transaction failed";
  return msg.split("\n")[0];
}
