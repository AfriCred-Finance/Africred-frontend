import { http, createConfig } from "wagmi";
import { base, baseSepolia, bsc, bscTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { BNB, BNB_TESTNET, MAINNET, SEPOLIA } from "./contracts";

// Base mainnet is the default; Base Sepolia stays available so we can keep
// running the existing testnet flows during launch.
//
// BNB Chain is here purely as a *source* for cross-chain deposits — no vaults live
// there. A deposit sent from BNB still settles on Base, so both chains must be in
// the config at once: the LP signs on BNB while the UI reads vault state and order
// status from Base. That is why reads on the vault page pass an explicit chainId.
export const wagmiConfig = createConfig({
  chains: [base, baseSepolia, bsc, bscTestnet],
  connectors: [farcasterMiniApp(), injected()],
  transports: {
    [base.id]: http(MAINNET.rpc),
    [baseSepolia.id]: http(SEPOLIA.rpc),
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
