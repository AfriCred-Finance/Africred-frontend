import { http, createConfig } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { MAINNET, SEPOLIA } from "./contracts";

// Base mainnet is the default; Base Sepolia stays available so we can keep
// running the existing testnet flows during launch.
export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [farcasterMiniApp(), injected()],
  transports: {
    [base.id]: http(MAINNET.rpc),
    [baseSepolia.id]: http(SEPOLIA.rpc),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
