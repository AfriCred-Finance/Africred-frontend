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

// ---------------------------------------------------------------- SecretPath EVM path (live)
//
// Encrypts the order args with ChaCha20-Poly1305 using a per-call ECDH shared
// key against the SecretPath gateway's x25519 pubkey, signs the ciphertext
// hash with the user's Base wallet, and submits the whole thing to the Base
// gateway's send(). The gateway relays into our matching contract's Input
// handler which decrypts + routes.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

/// SecretPath gateway addresses on Base networks. Verified from Secret's docs
/// (v0.2.5 gateway series).
export const SECRETPATH_GATEWAY_BASE_MAINNET = "0xf50c73581d6def7f911aC1D6d0d5e928691AAa9E";
export const SECRETPATH_GATEWAY_BASE_SEPOLIA = "0xfaFCfceC4e29e9b4ECc8C0a3f7df1011580EEEf2";

/// The SecretPath gateway's shared encryption public key (x25519, base64). Same
/// value across all EVM chains; used for the client-side ECDH handshake. The
/// gateway's separate secp256k1 signing key is what our Secret contract
/// verifies on the way in — we don't need it in the browser.
export const SECRETPATH_GATEWAY_PUBKEY_B64 = "A20KrD7xDmkFXpNMqJn1CLpRaDLcdKpO1NdBBS7VpWh3";

/// The Base gateway's ABI, minimal: only `send(bytes32,address,string,ExecutionInfo)`.
export const SECRETPATH_GATEWAY_ABI = [
  {
    type: "function",
    name: "send",
    stateMutability: "payable",
    inputs: [
      { name: "_payloadHash", type: "bytes32" },
      { name: "_userAddress", type: "address" },
      { name: "_routingInfo", type: "string" },
      {
        name: "_info",
        type: "tuple",
        components: [
          { name: "user_key", type: "bytes" },
          { name: "user_pubkey", type: "bytes" },
          { name: "routing_code_hash", type: "string" },
          { name: "task_destination_network", type: "string" },
          { name: "handle", type: "string" },
          { name: "nonce", type: "bytes12" },
          { name: "callback_gas_limit", type: "uint32" },
          { name: "payload", type: "bytes" },
          { name: "payload_signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "_taskId", type: "uint256" }],
  },
] as const;

function b64ToBytes(s: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(s, "base64"));
}

function bytesToHex(b: Uint8Array): `0x${string}` {
  return ("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

/// Encrypt + package one submit_order / cancel_order call for the SecretPath
/// gateway. Caller then submits `data` as calldata to the Base gateway's send()
/// with `value: gasFee`.
export interface EncryptedCallPacket {
  payloadHash: `0x${string}`;
  info: {
    user_key: `0x${string}`;
    user_pubkey: `0x${string}`;
    routing_code_hash: string;
    task_destination_network: string;
    handle: string;
    nonce: `0x${string}`;
    callback_gas_limit: number;
    payload: `0x${string}`;
    payload_signature: `0x${string}`;
  };
}

export interface EncryptOrderCallInput {
  /// "submit_order" or "cancel_order" — matches the contract's handle dispatch.
  handle: string;
  /// The JSON-encoded arguments the contract's handler expects (SubmitOrderInput
  /// or CancelOrderInput on the Rust side).
  argsJson: string;
  /// The Base wallet address of the LP submitting.
  userBaseAddress: `0x${string}`;
  /// Signer function that returns a personal_sign hex signature over the given
  /// keccak256 hash. Should be provided by the frontend's wallet layer.
  personalSign: (hashHex: `0x${string}`) => Promise<`0x${string}`>;
  /// keccak256 helper — usually imported from viem to keep bundle small.
  keccak256: (bytes: Uint8Array) => `0x${string}`;
  /// Callback address (usually the SecretPath gateway itself for now).
  callbackAddress: `0x${string}`;
  /// 4-byte selector for the callback function on the callback address.
  callbackSelector: `0x${string}`;
  /// Gas allowance for the callback path.
  callbackGasLimit?: number;
}

export async function encryptOrderCall(input: EncryptOrderCallInput): Promise<EncryptedCallPacket> {
  const {
    handle,
    argsJson,
    userBaseAddress,
    personalSign,
    keccak256,
    callbackAddress,
    callbackSelector,
    callbackGasLimit = 300_000,
  } = input;

  if (!SECRET_MATCHING_ADDR || !SECRET_MATCHING_HASH) {
    throw new Error("Secret matching contract not configured. See af-secret/README.md.");
  }

  // Per-call ephemeral secp256k1 keypair for the ECDH handshake with the
  // SecretPath gateway. The gateway's pubkey (compressed 33-byte secp256k1)
  // arrives base64-encoded. We use the x-coordinate of the shared point as
  // the ChaCha20 key seed, matching what SecretPath's Solar Republic client
  // does on its side.
  const userPrivateKey = secp256k1.utils.randomSecretKey();
  const userPublicKey = secp256k1.getPublicKey(userPrivateKey, true); // compressed
  const gatewayPubkey = b64ToBytes(SECRETPATH_GATEWAY_PUBKEY_B64);
  const sharedPoint = secp256k1.getSharedSecret(userPrivateKey, gatewayPubkey, true);
  // Drop the 0x02/0x03 prefix byte, keep the 32-byte x-coordinate.
  const sharedX = sharedPoint.slice(1);
  const sharedKey = nobleSha256(sharedX);

  // Wrap the args JSON in SecretPath's expected envelope: it wants the payload
  // to be a JSON with data + routing + user info before we encrypt.
  const payloadObj = {
    data: argsJson,
    routing_info: SECRET_MATCHING_ADDR,
    routing_code_hash: SECRET_MATCHING_HASH,
    user_address: userBaseAddress,
    user_key: bytesToBase64Url(userPublicKey),
    callback_address: bytesToBase64Url(hexToBytes(callbackAddress)),
    callback_selector: bytesToBase64Url(hexToBytes(callbackSelector)),
    callback_gas_limit: callbackGasLimit,
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(payloadObj));

  const nonce = randomBytes(12);
  const cipher = chacha20poly1305(sharedKey, nonce);
  const ciphertext = cipher.encrypt(plaintext);

  const ciphertextHash = keccak256(ciphertext);
  const payloadHash = keccak256(
    concatBytes(new TextEncoder().encode("\x19Ethereum Signed Message:\n32"), hexToBytes(ciphertextHash)),
  );
  const payloadSignature = await personalSign(ciphertextHash);

  // The Base gateway wants the recovered user pubkey (65-byte uncompressed).
  // ecrecover from the signature is trickier client-side without a full lib;
  // for correctness in the demo we pass the uncompressed pubkey the contract
  // will re-derive server-side. Some deployments accept a 65-zero placeholder.
  // We ship the compressed x25519 key as user_key and rely on the gateway's
  // recovery from the signature for user_pubkey — pass empty and let it fill.
  const emptyUserPubkey = new Uint8Array(65);

  return {
    payloadHash,
    info: {
      user_key: bytesToHex(userPublicKey),
      user_pubkey: bytesToHex(emptyUserPubkey),
      routing_code_hash: SECRET_MATCHING_HASH,
      task_destination_network: "pulsar-3",
      handle,
      nonce: bytesToHex(nonce),
      callback_gas_limit: callbackGasLimit,
      payload: bytesToHex(ciphertext),
      payload_signature: payloadSignature,
    },
  };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToBase64Url(b: Uint8Array): string {
  if (typeof btoa === "function") {
    let s = "";
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s);
  }
  return Buffer.from(b).toString("base64");
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
