// Client-side helpers for interacting with the AfriCred matching contract on
// Secret Network. Two paths are supported:
//
//   1. Direct: user connects a Secret (Keplr) wallet and calls the contract
//      themselves. Simplest for demos; requires the user to have SCRT for gas.
//   2. Via SecretPath: user stays on Base, calls the SecretPath EVM gateway
//      with an encrypted payload; the gateway relays into Secret. Recommended
//      for production (user only needs USDC + a small amount of ETH for gas).
//
// This file exposes the Direct path today. The SecretPath EVM gateway wrapper
// is stubbed and returns a clear error until we wire it in Week 3, once the
// Secret contract is deployed and we know its exact ChaCha20-Poly1305 pubkey.

import { SecretNetworkClient, Wallet } from "secretjs";
import {
  SECRET_CHAIN_ID,
  SECRET_LCD,
  SECRET_MATCHING_ADDR,
  SECRET_MATCHING_HASH,
} from "./contracts";

export type Side = "ask" | "bid";

export interface DepthLevel {
  price_e6: string;
  amount_shares: string;
}

export interface DepthResponse {
  asks: DepthLevel[];
  bids: DepthLevel[];
  epoch: number;
  epoch_ends_at: number;
}

export interface MyOrder {
  order_id: number;
  vault: string;
  side: Side;
  amount_shares: string;
  filled_shares: string;
  price_e6: string;
  epoch: number;
  status: "resting" | "matched" | "cancelled";
}

interface MyOrdersResponse {
  orders: MyOrder[];
}

interface EpochResponse {
  epoch: number;
  ends_at: number;
}

function assertConfigured() {
  if (!SECRET_MATCHING_ADDR || !SECRET_MATCHING_HASH) {
    throw new Error(
      "Secret matching contract is not configured. Deploy per af-secret/README.md and set NEXT_PUBLIC_SECRET_MATCHING_ADDR + NEXT_PUBLIC_SECRET_MATCHING_HASH."
    );
  }
}

/// Read-only client — used for depth/epoch/orders queries. No wallet needed.
export function readClient(): SecretNetworkClient {
  return new SecretNetworkClient({
    chainId: SECRET_CHAIN_ID,
    url: SECRET_LCD,
  });
}

// ---------------------------------------------------------------- queries

export async function queryDepth(vault: string): Promise<DepthResponse> {
  assertConfigured();
  const client = readClient();
  return (await client.query.compute.queryContract({
    contract_address: SECRET_MATCHING_ADDR,
    code_hash: SECRET_MATCHING_HASH,
    query: { depth: { vault } },
  })) as DepthResponse;
}

export async function queryMyOrders(ownerBase: string): Promise<MyOrder[]> {
  assertConfigured();
  const client = readClient();
  const res = (await client.query.compute.queryContract({
    contract_address: SECRET_MATCHING_ADDR,
    code_hash: SECRET_MATCHING_HASH,
    query: { my_orders: { owner_base: ownerBase } },
  })) as MyOrdersResponse;
  return res.orders;
}

export async function queryCurrentEpoch(vault: string): Promise<EpochResponse> {
  assertConfigured();
  const client = readClient();
  return (await client.query.compute.queryContract({
    contract_address: SECRET_MATCHING_ADDR,
    code_hash: SECRET_MATCHING_HASH,
    query: { current_epoch: { vault } },
  })) as EpochResponse;
}

// ---------------------------------------------------------------- executes
//
// Two execute helpers. The demo path uses a Direct Secret wallet (via Keplr in
// the browser). The production path is buildSecretPathCall — it returns the
// calldata a Base transaction should include when calling the SecretPath EVM
// gateway; wiring that call into the frontend transaction pipeline is Week 3
// scope.

interface SubmitOrderParams {
  ownerBase: string;      // 0x… Base address that locked the funds
  vault: string;          // 0x… vault address
  side: Side;
  amountShares: bigint;   // in share units (6 decimals like USDC)
  priceE6: bigint;        // USDC per share, e6
}

/// Submit an order via a directly-connected Keplr wallet on Secret. The
/// mnemonic/wallet must be provided by the caller.
///
/// In production, this is what the SecretPath gateway does on the user's
/// behalf — the user never touches Secret directly. This helper stays useful
/// for demos and local development.
export async function submitOrderDirect(
  wallet: Wallet,
  params: SubmitOrderParams,
): Promise<{ txhash: string; orderId?: number }> {
  assertConfigured();
  const client = new SecretNetworkClient({
    chainId: SECRET_CHAIN_ID,
    url: SECRET_LCD,
    wallet,
    walletAddress: wallet.address,
  });

  const tx = await client.tx.compute.executeContract(
    {
      sender: wallet.address,
      contract_address: SECRET_MATCHING_ADDR,
      code_hash: SECRET_MATCHING_HASH,
      msg: {
        submit_order: {
          owner_base: params.ownerBase,
          vault: params.vault,
          side: params.side,
          amount_shares: params.amountShares.toString(),
          price_e6: params.priceE6.toString(),
        },
      },
    },
    { gasLimit: 300_000 },
  );

  if (tx.code !== 0) {
    throw new Error(`Secret tx failed (code ${tx.code}): ${tx.rawLog}`);
  }
  const orderId = extractOrderId(tx.arrayLog ?? []);
  return { txhash: tx.transactionHash, orderId };
}

export async function cancelOrderDirect(
  wallet: Wallet,
  ownerBase: string,
  orderId: number,
): Promise<string> {
  assertConfigured();
  const client = new SecretNetworkClient({
    chainId: SECRET_CHAIN_ID,
    url: SECRET_LCD,
    wallet,
    walletAddress: wallet.address,
  });

  const tx = await client.tx.compute.executeContract(
    {
      sender: wallet.address,
      contract_address: SECRET_MATCHING_ADDR,
      code_hash: SECRET_MATCHING_HASH,
      msg: { cancel_order: { owner_base: ownerBase, order_id: orderId } },
    },
    { gasLimit: 200_000 },
  );
  if (tx.code !== 0) throw new Error(`Cancel failed: ${tx.rawLog}`);
  return tx.transactionHash;
}

function extractOrderId(logs: { key: string; value: string }[]): number | undefined {
  const hit = logs.find((l) => l.key === "order_id");
  return hit ? Number(hit.value) : undefined;
}

// ---------------------------------------------------------------- SecretPath EVM gateway
//
// The production Base-side flow: user submits a Base transaction to the
// SecretPath gateway with an encrypted payload; the gateway relays it into
// Secret with authenticated origin. The stub below documents the shape; the
// actual wiring happens in Week 3 once the gateway address and its ChaCha20
// pubkey are known for our specific vault.

export function buildSecretPathCallStub(_params: SubmitOrderParams): never {
  throw new Error(
    "SecretPath EVM path not wired yet. Week 3 scope. Use submitOrderDirect() for demos."
  );
}
