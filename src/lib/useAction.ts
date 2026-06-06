"use client";

import { useState, useCallback } from "react";
import { useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Abi, Address } from "viem";
import { wagmiConfig } from "./wagmi";

export type WriteArgs = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

/** Submit a write, wait for the receipt, surface pending/error, then run an optional callback. */
export function useAction(onDone?: () => void) {
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (args: WriteArgs) => {
      setError(null);
      setPending(true);
      try {
        const hash = await writeContractAsync(args as unknown as Parameters<typeof writeContractAsync>[0]);
        await waitForTransactionReceipt(wagmiConfig, { hash });
        onDone?.();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Transaction failed";
        // Trim verbose viem messages to the first meaningful line.
        setError(msg.split("\n")[0]);
      } finally {
        setPending(false);
      }
    },
    [writeContractAsync, onDone],
  );

  return { run, pending, error };
}
