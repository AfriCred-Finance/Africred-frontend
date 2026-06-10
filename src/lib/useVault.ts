"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { vaultAbi } from "./abis";
import { derivePhase } from "./format";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export function useVault(vault?: Address, account?: Address) {
  const base = vault ? ({ address: vault, abi: vaultAbi } as const) : undefined;

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
          { ...base, functionName: "loanTermDays" },
          { ...base, functionName: "targetAprBps" },
          { ...base, functionName: "repaymentType" },
          { ...base, functionName: "paymentIntervalDays" },
          { ...base, functionName: "custodied" },
          { ...base, functionName: "state" },
          { ...base, functionName: "fundingStart" },
          { ...base, functionName: "fundingEnd" },
          { ...base, functionName: "depositsOpen" },
          { ...base, functionName: "withdrawalsOpen" },
          { ...base, functionName: "balanceOf", args: [account ?? ZERO] },
        ]
      : [],
    query: { enabled: Boolean(vault), refetchInterval: 8000 },
  });

  return useMemo(() => {
    if (!data) return { isLoading, refetch, vault: undefined };
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
      loanTermDays,
      targetAprBps,
      repaymentType,
      paymentIntervalDays,
      custodied,
      state,
      fundingStart,
      fundingEnd,
      depositsOpen,
      withdrawalsOpen,
      shareBalance,
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
      bigint,
      bigint,
      number,
      bigint,
      boolean,
      number,
      bigint,
      bigint,
      boolean,
      boolean,
      bigint,
    ];

    const phase = derivePhase(state, fundingStart, fundingEnd);
    const sharePrice = totalSupply > 0n ? Number(totalAssets) / Number(totalSupply) : 1;

    return {
      isLoading,
      refetch,
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
        loanTermDays,
        targetAprBps,
        repaymentType,
        paymentIntervalDays,
        custodied,
        state,
        fundingStart,
        fundingEnd,
        depositsOpen,
        withdrawalsOpen,
        shareBalance,
        phase,
        sharePrice,
      },
    };
  }, [data, isLoading, refetch]);
}
