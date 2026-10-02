import { http, createConfig } from "wagmi";
import { base, baseSepolia, boba, bobaSepolia, bsc, bscTestnet } from "wagmi/chains";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { ARC, BNB, BNB_TESTNET, BOBA, BOBA_SEPOLIA, MAINNET, SEPOLIA, arcTestnet as arcDef } from "./contracts";

/// Arc is not in wagmi/chains, so it is defined from the same literal contracts.ts uses.
const arc = defineChain(arcDef);

// Base mainnet is the default; Base Sepolia stays available so we can keep
// running the existing testnet flows during launch.
//
// BNB Chain is here purely as a *source* for cross-chain deposits — no vaults live
// there. A deposit sent from BNB still settles on Base, so both chains must be in
// the config at once: the LP signs on BNB while the UI reads vault state and order
// status from Base. That is why reads on the vault page pass an explicit chainId.
export const wagmiConfig = createConfig({
  // Arc hosts the settlement vault and nothing else. It is a home chain rather than a
  // bridge source: an LP deposits into the vault there directly, and there is no bridge to
  // reach it with, since Arc is outside LayerZero's mesh.
  chains: [base, baseSepolia, arc, boba, bobaSepolia, bsc, bscTestnet],
  connectors: [farcasterMiniApp(), injected()],
  transports: {
    [base.id]: http(MAINNET.rpc),
    [baseSepolia.id]: http(SEPOLIA.rpc),
    [arc.id]: http(ARC.rpc),
    [boba.id]: http(BOBA.rpc),
    [bobaSepolia.id]: http(BOBA_SEPOLIA.rpc),
    [bsc.id]: http(BNB.rpc),
    [bscTestnet.id]: http(BNB_TESTNET.rpc),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
