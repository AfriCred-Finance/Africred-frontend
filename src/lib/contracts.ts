import type { Address } from "viem";

// Trim whitespace before validating — pasted env values on hosting dashboards
// often carry a leading/trailing space that viem's strict checksum then rejects.
const s = (v: string | undefined) => v?.trim() ?? "";
const env = (v: string | undefined) => {
  const t = s(v);
  return t.length > 0 ? (t as Address) : undefined;
};

export const CHAIN_ID = Number(s(process.env.NEXT_PUBLIC_CHAIN_ID) || "84532");
export const RPC_URL = s(process.env.NEXT_PUBLIC_RPC_URL) || "https://sepolia.base.org";

export const FACTORY_ADDRESS = env(process.env.NEXT_PUBLIC_FACTORY_ADDRESS);
export const ROUTER_ADDRESS = env(process.env.NEXT_PUBLIC_ROUTER_ADDRESS);
export const USDC_ADDRESS = env(process.env.NEXT_PUBLIC_USDC_ADDRESS);
export const SHARES_ESCROW_ADDRESS = env(process.env.NEXT_PUBLIC_SHARES_ESCROW_ADDRESS);

// ---- Secret Network side of the private secondary market.
export const SECRET_MATCHING_ADDR = s(process.env.NEXT_PUBLIC_SECRET_MATCHING_ADDR);
export const SECRET_MATCHING_HASH = s(process.env.NEXT_PUBLIC_SECRET_MATCHING_HASH);
export const SECRET_LCD = s(process.env.NEXT_PUBLIC_SECRET_LCD) || "https://pulsar.lcd.secretnodes.com";
export const SECRET_CHAIN_ID = s(process.env.NEXT_PUBLIC_SECRET_CHAIN_ID) || "pulsar-3";

export const isConfigured = Boolean(FACTORY_ADDRESS && USDC_ADDRESS);

export const EXPLORER = "https://sepolia.basescan.org";

// LayerZero EndpointV2 (shared testnet address, incl. Base Sepolia).
export const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f" as Address;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
