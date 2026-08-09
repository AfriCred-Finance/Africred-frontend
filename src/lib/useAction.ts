"use client";

import { useState, useCallback } from "react";
import { useChainId, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Abi, Address } from "viem";
import { useHomeChainId, type ConfiguredChainId } from "./contracts";
import { wagmiConfig } from "./wagmi";

/**
 * True only for a genuine wrong-network error.
 *
 * Deliberately narrow: viem prints a "Request Arguments" block containing a `chain:` line
 * in essentially every error it throws, so matching the bare word "chain" classifies
 * unrelated failures as network problems and hides the real cause.
 */
function isChainMismatch(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === "ChainMismatchError") return true;
  return /ChainMismatchError|does not match the target chain|chain (?:mismatch|of the wallet)/i.test(e.message);
}

export type WriteArgs = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

/**
 * Submit a write, wait for the receipt, surface pending/error, then run an optional callback.
 *
 * Writes are pinned to the vault's home chain, not the connected chain, and the wallet is
 * switched there first if needed. Without that, a wallet sitting on a deposit-source chain
 * like BNB would fire a transaction at a Base-only contract address: the request never
 * reaches a contract and the RPC rejects it as malformed ("invalid params"), which reads to
 * the user as a broken button rather than a wrong network.
 *
 * `chainId` overrides the target for writes that genuinely belong on another chain.
 */
export function useAction(onDone?: () => void, chainId?: ConfiguredChainId) {
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const connectedChainId = useChainId();
  const homeChainId = useHomeChainId();
  const target = chainId ?? homeChainId;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (args: WriteArgs): Promise<boolean> => {
      setError(null);
      setPending(true);

      const send = async () => {
        const hash = await writeContractAsync({
          ...args,
          chainId: target,
        } as unknown as Parameters<typeof writeContractAsync>[0]);
        await waitForTransactionReceipt(wagmiConfig, { hash, chainId: target });
      };

      try {
        try {
          await send();
        } catch (e: unknown) {
          // React's chain state can lag the wallet's, so decide from the actual error
          // rather than from `connectedChainId`. Switch, then retry once against the
          // freshly-switched connector so the LP does not have to click twice.
          if (!isChainMismatch(e)) throw e;
          await switchChainAsync({ chainId: target });
          await send();
        }
        onDone?.();
        return true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Transaction failed";
        if (/user rejected|denied|rejected the request/i.test(msg)) {
          setError("Request rejected in your wallet.");
        } else if (isChainMismatch(e)) {
          setError("This action runs on the vault's home chain. Approve the network switch to continue.");
        } else {
          // Trim verbose viem messages to the first meaningful line.
          setError(msg.split("\n")[0]);
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [writeContractAsync, switchChainAsync, connectedChainId, target, onDone],
  );

  return { run, pending, error };
}
