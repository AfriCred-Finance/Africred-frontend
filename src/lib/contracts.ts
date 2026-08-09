"use client";

import { useChainId } from "wagmi";
import { base, baseSepolia, bsc, bscTestnet } from "wagmi/chains";
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
const SEPOLIA_WHITELISTED_SETTLEMENT_VAULT = "0x657C8EDcEEc12826F408C9f8aF25Ea6A5d6b1000" as Address;

const MAINNET_SETTLEMENT_VAULT = "0x730A36B6C4C61c1422Ba6266e517819AD07C5e91" as Address;
const MAINNET_WHITELISTED_SETTLEMENT_VAULT = "0x487FAB1f2EB45a3beAa64c671F48C0961d4952Cf" as Address;

/// Chains that host vaults.
export type SupportedChainId = typeof base.id | typeof baseSepolia.id;

/// Every chain in the wagmi config, home chains plus deposit sources. wagmi types
/// `chainId` as a literal union, so anything passed to a read or write needs this rather
/// than a plain `number`.
export type ConfiguredChainId = SupportedChainId | typeof bsc.id | typeof bscTestnet.id;

export interface ChainAddresses {
  chainId: SupportedChainId;
  chainName: "Base" | "Base Sepolia";
  short: "base" | "sepolia";
  factory: Address | undefined;
  router: Address | undefined;
  usdc: Address;
  sharesEscrow: Address | undefined;
  settlementVault: Address | undefined;
  whitelistedSettlementVault: Address | undefined;
  /// AfriCredComposer. Receives cross-chain deposits and holds any that could not
  /// complete, so it is also where an LP retries or claims a refund.
  composer: Address | undefined;
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
  whitelistedSettlementVault:
    env(process.env.NEXT_PUBLIC_MAINNET_WHITELISTED_SETTLEMENT_VAULT_ADDRESS) ?? MAINNET_WHITELISTED_SETTLEMENT_VAULT,
  composer: env(process.env.NEXT_PUBLIC_MAINNET_COMPOSER_ADDRESS),
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
  whitelistedSettlementVault:
    env(process.env.NEXT_PUBLIC_SEPOLIA_WHITELISTED_SETTLEMENT_VAULT_ADDRESS) ?? SEPOLIA_WHITELISTED_SETTLEMENT_VAULT,
  composer: env(process.env.NEXT_PUBLIC_SEPOLIA_COMPOSER_ADDRESS) ?? env(process.env.NEXT_PUBLIC_COMPOSER_ADDRESS),
  rpc: s(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL)
    || s(process.env.NEXT_PUBLIC_RPC_URL)
    || "https://sepolia.base.org",
  explorer: "https://sepolia.basescan.org",
  isTestnet: true,
};

/// Default chain is Base mainnet. Sepolia is the switchable option.
export const DEFAULT_CHAIN = MAINNET;

export const HOME_CHAIN_IDS: readonly number[] = [base.id, baseSepolia.id];

export function homeChainFor(chainId: number): ChainAddresses | undefined {
  if (chainId === base.id) return MAINNET;
  if (chainId === baseSepolia.id) return SEPOLIA;
  return undefined;
}

/// Hook that returns the address bundle for the currently-connected chain.
/// Falls back to the default chain when no wallet is connected — and also when the
/// wallet sits on a bridge source chain like BNB, where no vaults exist. In that
/// case this returns the *home* chain the source deposits into, so vault reads keep
/// resolving while the LP signs elsewhere.
export function useChainAddresses(): ChainAddresses {
  const chainId = useChainId();
  const home = homeChainFor(chainId);
  if (home) return home;
  const source = bridgeSourceFor(chainId);
  if (source) return source.home;
  return DEFAULT_CHAIN;
}

/**
 * The chain every protocol read must target.
 *
 * `useChainAddresses` returns the right *addresses* when the wallet is on a bridge source
 * like BNB Chain, but wagmi still routes reads to the *connected* chain unless told
 * otherwise. Leaving that implicit means querying a Base address on BNB Chain, which
 * returns nothing and renders as "no vaults deployed" rather than as an error.
 *
 * So every read of a home-chain contract must pass this as `chainId`. On a home chain it
 * is just the connected chain, so pinning it is never wrong.
 */
export function useHomeChainId(): SupportedChainId {
  return useChainAddresses().chainId;
}

// ---------------------------------------------------------------------------
// Cross-chain deposit sources. These chains host an AfriCredDepositGateway but no
// vaults: value bridges to a home chain and shares are minted there.
// ---------------------------------------------------------------------------

/// Binance-Peg USDC. Note this is an 18-decimal token, unlike the 6-decimal USDC on
/// Base. Amounts on the BNB side are therefore in 18 decimals and Stargate truncates
/// anything finer than its 6 shared decimals.
const BNB_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" as Address;

export type BridgeSourceChainId = typeof bsc.id | typeof bscTestnet.id;

export interface BridgeSource {
  chainId: BridgeSourceChainId;
  chainName: "BNB Chain" | "BNB Testnet";
  short: "bnb" | "bnb-testnet";
  /// LayerZero endpoint id of THIS chain. The composer keys its gateway registry on it,
  /// and it is also where bridged shares are sent back to.
  eid: number;
  /// AfriCredDepositGateway on this chain.
  gateway: Address | undefined;
  /// The stable LPs send from here.
  bridgeToken: Address | undefined;
  bridgeTokenSymbol: string;
  bridgeTokenDecimals: number;
  /// Where the deposit actually lands.
  home: ChainAddresses;
  /// AfriCredShareOFT, when shares are bridged back to this chain. Unset means shares
  /// stay on the home chain.
  shareOft: Address | undefined;
  /// Block the gateway was deployed at. Lower bound for the log scan that discovers
  /// deposits sent from another device. Without it a scan has nowhere to stop.
  gatewayFromBlock: bigint | undefined;
  nativeSymbol: string;
  rpc: string;
  explorer: string;
  isTestnet: boolean;
}

const blockEnv = (v: string | undefined) => {
  const t = s(v);
  if (t.length === 0) return undefined;
  try {
    return BigInt(t);
  } catch {
    return undefined;
  }
};

export const BNB: BridgeSource = {
  chainId: bsc.id,
  chainName: "BNB Chain",
  short: "bnb",
  eid: 30_102,
  gateway: env(process.env.NEXT_PUBLIC_BNB_GATEWAY_ADDRESS),
  bridgeToken: env(process.env.NEXT_PUBLIC_BNB_USDC_ADDRESS) ?? BNB_USDC,
  bridgeTokenSymbol: "USDC",
  bridgeTokenDecimals: 18,
  home: MAINNET,
  shareOft: env(process.env.NEXT_PUBLIC_BNB_SHARE_OFT_ADDRESS),
  gatewayFromBlock: blockEnv(process.env.NEXT_PUBLIC_BNB_GATEWAY_FROM_BLOCK),
  nativeSymbol: "BNB",
  // Must be an endpoint that serves `eth_getLogs`, because order discovery scans the
  // gateway's events. Binance's own `bsc-dataseed` rejects log queries outright ("limit
  // exceeded" even for a 500-block span), which would silently break discovery and leave
  // only the manual message-id path. publicnode serves 5000-block spans fine.
  rpc: s(process.env.NEXT_PUBLIC_BNB_RPC_URL) || "https://bsc-rpc.publicnode.com",
  explorer: "https://bscscan.com",
  isTestnet: false,
};

export const BNB_TESTNET: BridgeSource = {
  chainId: bscTestnet.id,
  chainName: "BNB Testnet",
  short: "bnb-testnet",
  eid: 40_102,
  gateway: env(process.env.NEXT_PUBLIC_BNB_TESTNET_GATEWAY_ADDRESS),
  // No canonical test USDC on BNB testnet, and whichever token you use must be the
  // one the configured Stargate pool actually bridges. So there is no default.
  bridgeToken: env(process.env.NEXT_PUBLIC_BNB_TESTNET_USDC_ADDRESS),
  bridgeTokenSymbol: "USDC",
  bridgeTokenDecimals: 18,
  home: SEPOLIA,
  shareOft: env(process.env.NEXT_PUBLIC_BNB_TESTNET_SHARE_OFT_ADDRESS),
  gatewayFromBlock: blockEnv(process.env.NEXT_PUBLIC_BNB_TESTNET_GATEWAY_FROM_BLOCK),
  nativeSymbol: "tBNB",
  rpc: s(process.env.NEXT_PUBLIC_BNB_TESTNET_RPC_URL) || "https://data-seed-prebsc-1-s1.binance.org:8545",
  explorer: "https://testnet.bscscan.com",
  isTestnet: true,
};

export const BRIDGE_SOURCES: readonly BridgeSource[] = [BNB, BNB_TESTNET];

export function bridgeSourceFor(chainId: number): BridgeSource | undefined {
  return BRIDGE_SOURCES.find((c) => c.chainId === chainId);
}

/// Bridge sources that deposit into the given home chain and are fully configured.
/// An unconfigured source is filtered out rather than shown broken.
export function bridgeSourcesForHome(homeChainId: number): readonly BridgeSource[] {
  return BRIDGE_SOURCES.filter(
    (c) => c.home.chainId === homeChainId && Boolean(c.gateway) && Boolean(c.bridgeToken),
  );
}

/// The bridge source the wallet is currently sitting on, if any.
export function useBridgeSource(): BridgeSource | undefined {
  return bridgeSourceFor(useChainId());
}

// ---- Secret Network (chain-agnostic; the private matching contract is shared).
export const SECRET_MATCHING_ADDR = s(process.env.NEXT_PUBLIC_SECRET_MATCHING_ADDR);
export const SECRET_MATCHING_HASH = s(process.env.NEXT_PUBLIC_SECRET_MATCHING_HASH);
export const SECRET_LCD = s(process.env.NEXT_PUBLIC_SECRET_LCD) || "https://pulsar.lcd.secretnodes.com";
export const SECRET_CHAIN_ID = s(process.env.NEXT_PUBLIC_SECRET_CHAIN_ID) || "pulsar-3";

// LayerZero EndpointV2 (shared across Base + Base Sepolia).
export const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f" as Address;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
