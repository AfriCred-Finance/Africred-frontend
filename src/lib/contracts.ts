import type { Address } from "viem";

const env = (v: string | undefined) => (v && v.length > 0 ? (v as Address) : undefined);

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org";

export const FACTORY_ADDRESS = env(process.env.NEXT_PUBLIC_FACTORY_ADDRESS);
export const ROUTER_ADDRESS = env(process.env.NEXT_PUBLIC_ROUTER_ADDRESS);
export const USDC_ADDRESS = env(process.env.NEXT_PUBLIC_USDC_ADDRESS);

export const isConfigured = Boolean(FACTORY_ADDRESS && USDC_ADDRESS);

export const EXPLORER = "https://sepolia.basescan.org";

// LayerZero EndpointV2 (shared testnet address, incl. Base Sepolia).
export const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f" as Address;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
