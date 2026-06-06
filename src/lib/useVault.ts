"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { vaultAbi } from "./abis";
import { derivePhase } from "./format";

export type EpochInfo = { fundingStart: bigint; epochStart: bigint; epochEnd: bigint };

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
          { ...base, functionName: "custodied" },
          { ...base, functionName: "started" },
          { ...base, functionName: "isFunding" },
          { ...base, functionName: "isInEpoch" },
          { ...base, functionName: "getCurrentEpoch" },
          { ...base, functionName: "getCurrentEpochInfo" },
          { ...base, functionName: "balanceOf", args: [account ?? "0x0000000000000000000000000000000000000000"] },
          { ...base, functionName: "whitelisted", args: [account ?? "0x0000000000000000000000000000000000000000"] },
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
      custodied,
      started,
      isFunding,
      isInEpoch,
      epochId,
      epochInfo,
      shareBalance,
      whitelisted,
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
      boolean,
      boolean,
      boolean,
      boolean,
      bigint,
      EpochInfo,
      bigint,
      boolean,
    ];

    const phase = derivePhase({ started, custodied, isFunding, isInEpoch, epochStart: epochInfo.epochStart });
    // Share price = totalAssets / totalSupply (in asset units), guarding div-by-zero.
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
        custodied,
        started,
        isFunding,
        isInEpoch,
        epochId,
        epochInfo,
        shareBalance,
        whitelisted,
        phase,
        sharePrice,
      },
    };
  }, [data, isLoading, refetch]);
}
