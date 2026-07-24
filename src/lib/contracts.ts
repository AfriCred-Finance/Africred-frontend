"use client";

import { useChainId } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import type { Address } from "viem";

const s = (v: string | undefined) => v?.trim() ?? "";
const env = (v: string | undefined) => {
  const t = s(v);
  return t.length > 0 ? (t as Address) : undefined;
};

const MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const SEPOLIA_USDC = "0xAF11dAe4Cdc0303B9D3EF311b4Bcd4C273E0101c" as Address;

const SEPOLIA_FACTORY = "0x98C7bd4CB5097a6beE424898eA29DB96Ac6aB485" as Address;
const SEPOLIA_ROUTER = "0x3Ceada45E2110E566cf2c8EB88C4E5d39040128d" as Address;
const SEPOLIA_SHARES_ESCROW = "0x19B774441eAfEAD42F823A49b6a767Bb683bEc0D" as Address;
const SEPOLIA_SETTLEMENT_VAULT = "0x826E6922b3582240798C9316DC8f722C84f9Eb6E" as Address;

const MAINNET_SETTLEMENT_VAULT = "0x730A36B6C4C61c1422Ba6266e517819AD07C5e91" as Address;

export type SupportedChainId = typeof base.id | typeof baseSepolia.id;

export interface ChainAddresses {
  chainId: SupportedChainId;
  chainName: "Base" | "Base Sepolia";
  short: "base" | "sepolia";
  factory: Address | undefined;
  router: Address | undefined;
  usdc: Address;
  sharesEscrow: Address | undefined;
  settlementVault: Address | undefined;
  rpc: string;
  explorer: string;
  isTestnet: boolean;
}

export const MAINNET: ChainAddresses = {
  chainId: base.id,
  chainName: "Base",
  short: "base",
  factory: env(process.env.NEXT_PUBLIC_MAINNET_FACTORY_ADDRESS),
  router: env(process.env.NEXT_PUBLIC_MAINNET_ROUTER_ADDRESS),
  usdc: env(process.env.NEXT_PUBLIC_MAINNET_USDC_ADDRESS) ?? MAINNET_USDC,
  sharesEscrow: env(process.env.NEXT_PUBLIC_MAINNET_SHARES_ESCROW_ADDRESS),
  settlementVault: env(process.env.NEXT_PUBLIC_MAINNET_SETTLEMENT_VAULT_ADDRESS) ?? MAINNET_SETTLEMENT_VAULT,
  rpc: s(process.env.NEXT_PUBLIC_MAINNET_RPC_URL) || "https://mainnet.base.org",
  explorer: "https://basescan.org",
  isTestnet: false,
};

export const SEPOLIA: ChainAddresses = {
  chainId: baseSepolia.id,
  chainName: "Base Sepolia",
  short: "sepolia",
  factory: env(process.env.NEXT_PUBLIC_SEPOLIA_FACTORY_ADDRESS)
        ?? env(process.env.NEXT_PUBLIC_FACTORY_ADDRESS)
        ?? SEPOLIA_FACTORY,
  router: env(process.env.NEXT_PUBLIC_SEPOLIA_ROUTER_ADDRESS)
        ?? env(process.env.NEXT_PUBLIC_ROUTER_ADDRESS)
        ?? SEPOLIA_ROUTER,
  usdc: env(process.env.NEXT_PUBLIC_SEPOLIA_USDC_ADDRESS)
     ?? env(process.env.NEXT_PUBLIC_USDC_ADDRESS)
     ?? SEPOLIA_USDC,
  sharesEscrow: env(process.env.NEXT_PUBLIC_SEPOLIA_SHARES_ESCROW_ADDRESS)
             ?? env(process.env.NEXT_PUBLIC_SHARES_ESCROW_ADDRESS)
             ?? SEPOLIA_SHARES_ESCROW,
  settlementVault: env(process.env.NEXT_PUBLIC_SEPOLIA_SETTLEMENT_VAULT_ADDRESS) ?? SEPOLIA_SETTLEMENT_VAULT,
  rpc: s(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL)
    || s(process.env.NEXT_PUBLIC_RPC_URL)
    || "https://sepolia.base.org",
  explorer: "https://sepolia.basescan.org",
  isTestnet: true,
};

/// Default chain is Base mainnet. Sepolia is the switchable option.
export const DEFAULT_CHAIN = MAINNET;

/// Hook that returns the address bundle for the currently-connected chain.
/// Falls back to the default chain when no wallet is connected.
export function useChainAddresses(): ChainAddresses {
  const chainId = useChainId();
  if (chainId === base.id) return MAINNET;
  if (chainId === baseSepolia.id) return SEPOLIA;
  return DEFAULT_CHAIN;
}

// ---- Secret Network (chain-agnostic; the private matching contract is shared).
export const SECRET_MATCHING_ADDR = s(process.env.NEXT_PUBLIC_SECRET_MATCHING_ADDR);
export const SECRET_MATCHING_HASH = s(process.env.NEXT_PUBLIC_SECRET_MATCHING_HASH);
export const SECRET_LCD = s(process.env.NEXT_PUBLIC_SECRET_LCD) || "https://pulsar.lcd.secretnodes.com";
export const SECRET_CHAIN_ID = s(process.env.NEXT_PUBLIC_SECRET_CHAIN_ID) || "pulsar-3";

// LayerZero EndpointV2 (shared across Base + Base Sepolia).
export const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f" as Address;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
