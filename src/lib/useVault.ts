"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { vaultAbi, loanRegistryAbi } from "./abis";
import { useHomeChainId, type ConfiguredChainId } from "./contracts";
import { derivePhase } from "./format";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export type Loan = {
  vault: Address;
  borrowerRef: `0x${string}`;
  principal: bigint;
  rateBps: bigint;                  // flat interest rate in bps (e.g. 1500 = 15%)
  termDays: number;
  repaymentType: number;            // 0 bullet, 1 interest-periodic, 2 amortizing
  installments: number;
  risk: number;                     // 0 Low, 1 Medium, 2 High
  agreementHash: `0x${string}`;
  dossierURI: string;
  description: string;
  status: number;                   // 0 Active, 1 Repaying, 2 Repaid, 3 Defaulted
  amountRepaid: bigint;
  installmentsPaid: number;
  nextInstallmentAmount: bigint;
  nextDueDate: bigint;              // unix timestamp
};

/**
 * Read a vault's full state.
 *
 * Reads are pinned to the vault's home chain by default, NOT to the connected chain. That
 * matters because a cross-chain deposit has the LP signing on BNB Chain while the vault,
 * and every number shown about it, lives on Base. Following the wallet would query a Base
 * address on BNB Chain and quietly return nothing.
 *
 * `chainId` overrides that when a caller needs a specific chain.
 */
export function useVault(vault?: Address, account?: Address, chainId?: ConfiguredChainId) {
  const homeChainId = useHomeChainId();
  const resolved = chainId ?? homeChainId;
  const base = vault ? ({ address: vault, abi: vaultAbi, chainId: resolved } as const) : undefined;

  const { data, refetch, isLoading } = useReadContracts({
    allowFailure: false,
    contracts: base
      ? [
          { ...base, functionName: "name" },
          { ...base, functionName: "symbol" },
          { ...base, functionName: "decimals" },
          { ...base, functionName: "asset" },
          { ...base, functionName: "owner" },
          { ...base, functionName: "allocator" },
          { ...base, functionName: "totalAssets" },
          { ...base, functionName: "totalSupply" },
          { ...base, functionName: "totalDeposits" },
          { ...base, functionName: "maxDeposits" },
          { ...base, functionName: "loanRegistry" },
          { ...base, functionName: "loanId" },
          { ...base, functionName: "custodied" },
          { ...base, functionName: "state" },
          { ...base, functionName: "tranched" },
          { ...base, functionName: "bufferAmount" },
          { ...base, functionName: "depositsOpen" },
          { ...base, functionName: "withdrawalsOpen" },
          { ...base, functionName: "balanceOf", args: [account ?? ZERO] },
          { ...base, functionName: "recoveryRecorded" },
          { ...base, functionName: "whitelistEnabled" },
        ]
      : [],
    query: { enabled: Boolean(vault), refetchInterval: 30000 },
  });

  const loanRegistry = data ? (data[10] as Address) : undefined;
  const loanId = data ? (data[11] as bigint) : undefined;

  const { data: loanData, refetch: refetchLoan } = useReadContract({
    address: loanRegistry,
    abi: loanRegistryAbi,
    functionName: "getLoan",
    args: loanId !== undefined ? [loanId] : undefined,
    chainId: resolved,
    query: { enabled: Boolean(loanRegistry && loanId !== undefined), refetchInterval: 30000 },
  });

  return useMemo(() => {
    const refetchAll = () => {
      refetch();
      refetchLoan();
    };
    if (!data) return { isLoading, refetch: refetchAll, vault: undefined };
    const [
      name,
      symbol,
      decimals,
      asset,
      owner,
      allocator,
      totalAssets,
      totalSupply,
      totalDeposits,
      maxDeposits,
      registry,
      lid,
      custodied,
      state,
      tranched,
      bufferAmount,
      depositsOpen,
      withdrawalsOpen,
      shareBalance,
      recoveryRecorded,
      whitelistEnabled,
    ] = data as unknown as [
      string,
      string,
      number,
      Address,
      Address,
      Address,
      bigint,
      bigint,
      bigint,
      bigint,
      Address,
      bigint,
      boolean,
      number,
      boolean,
      bigint,
      boolean,
      boolean,
      bigint,
      boolean,
      boolean,
    ];

    const phase = derivePhase(state);
    const sharePrice = totalSupply > 0n ? Number(totalAssets) / Number(totalSupply) : 1;
    const loan = (loanData as Loan | undefined) ?? undefined;

    return {
      isLoading,
      refetch: refetchAll,
      vault: {
        name,
        symbol,
        decimals,
        asset,
        owner,
        allocator,
        totalAssets,
        totalSupply,
        totalDeposits,
        maxDeposits,
        loanRegistry: registry,
        loanId: lid,
        custodied,
        state,
        tranched,
        bufferAmount,
        depositsOpen,
        withdrawalsOpen,
        shareBalance,
        recoveryRecorded,
        whitelistEnabled,
        phase,
        sharePrice,
        loan,
      },
    };
  }, [data, loanData, isLoading, refetch, refetchLoan]);
}
