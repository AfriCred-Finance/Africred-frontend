"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { formatUnits, parseAbiItem, type Address, type PublicClient } from "viem";
import { bridgeSourcesForHome, type BridgeSource } from "./contracts";
import type { TrackedOrder } from "./crossChainOrders";

/// Declared as a parsed item rather than pulled out of `depositGatewayAbi`, so viem can
/// type the indexed `args` filter. Must stay identical to the event on
/// AfriCredDepositGateway.
const DEPOSIT_SENT = parseAbiItem(
  "event CrossChainDepositSent(bytes32 indexed guid, address indexed sender, address indexed vault, address receiver, uint256 amountSent, uint256 nativeFee)",
);

/**
 * Discover cross-chain deposits from chain state instead of local storage.
 *
 * The composer keys every recovery path on a LayerZero `guid`, and there is no
 * `ordersOf(account)` to query. Local storage alone therefore loses an LP's parked
 * deposit the moment they switch device, clear the browser, or call the gateway directly.
 * The funds stay recoverable on-chain and become invisible in the UI, which is the worst
 * combination.
 *
 * The gateway's `CrossChainDepositSent` indexes `sender` and `vault`, so the source chain
 * can be asked directly. That makes chain state the source of truth and local storage a
 * cache rather than the only record.
 */

/// Free public RPCs restrict `eth_getLogs` severely and inconsistently: some refuse the
/// method outright, some cap the span at 25-50 blocks, and some serve recent blocks but
/// reject anything they classify as archive. So the scan walks backwards from the head in
/// chunks and stops at whatever wall the endpoint puts up, keeping everything it already
/// read. Newest-first means a partial scan still finds the deposit an LP just made, which
/// is the case that actually matters.
const CHUNK = BigInt(process.env.NEXT_PUBLIC_BNB_LOG_CHUNK || "5000");
const MAX_CHUNKS = Number(process.env.NEXT_PUBLIC_BNB_LOG_MAX_CHUNKS || "12");

export type DiscoveredOrders = {
  orders: TrackedOrder[];
  /// True when the scan hit `MAX_CHUNKS` before reaching the gateway's deploy block, so
  /// older deposits exist but were not read. Surfaced in the UI rather than swallowed:
  /// a silent cap reads as "you have no other deposits", which would be a lie.
  truncated: boolean;
  scannedFrom: bigint | undefined;
};

async function scanSource(
  client: PublicClient,
  source: BridgeSource,
  sender: Address,
  vault: Address | undefined,
): Promise<DiscoveredOrders> {
  const gateway = source.gateway;
  if (!gateway) return { orders: [], truncated: false, scannedFrom: undefined };

  const head = await client.getBlockNumber();
  const floor = source.gatewayFromBlock ?? (head > 200_000n ? head - 200_000n : 0n);

  const logs: { args: Record<string, unknown>; transactionHash: `0x${string}`; blockNumber: bigint }[] = [];
  let to = head;
  let chunks = 0;
  let truncated = false;

  while (to >= floor) {
    if (chunks >= MAX_CHUNKS) {
      truncated = true;
      break;
    }
    const from = to - CHUNK + 1n > floor ? to - CHUNK + 1n : floor;
    try {
      const part = await client.getLogs({
        address: gateway,
        event: DEPOSIT_SENT,
        args: vault ? { sender, vault } : { sender },
        fromBlock: from,
        toBlock: to,
      });
      logs.push(...(part as unknown as typeof logs));
    } catch {
      // The endpoint refused this range: too wide, or too far back for its retention.
      // Keep what earlier chunks returned rather than failing the whole scan, and stop
      // walking back. Anything older is reachable via the manual message-id input.
      truncated = true;
      break;
    }
    chunks += 1;
    if (from === floor) break;
    to = from - 1n;
  }

  const orders: TrackedOrder[] = logs.map((log) => {
    const args = log.args as {
      guid: `0x${string}`;
      vault: Address;
      receiver: Address;
      amountSent: bigint;
    };
    return {
      guid: args.guid,
      vault: args.vault,
      receiver: args.receiver,
      srcChainId: source.chainId,
      homeChainId: source.home.chainId,
      amount: formatUnits(args.amountSent, source.bridgeTokenDecimals),
      tokenSymbol: source.bridgeTokenSymbol,
      txHash: log.transactionHash,
      // The event does not carry `bridgeBack`, and it does not need to: live status comes
      // from the composer, and this field only drives copy on the local-submit screen.
      bridgeBack: false,
      // No timestamp without an extra call per log. Block height is a fine ordering key
      // among discovered orders; see `mergeOrders` for how these sort against local ones.
      createdAt: 0,
      blockNumber: log.blockNumber,
    } as TrackedOrder & { blockNumber: bigint };
  });

  return { orders, truncated, scannedFrom: floor };
}

/**
 * Scan every configured bridge source that feeds `homeChainId` for this account's deposits.
 * Scoped to one vault when `vault` is given.
 */
export function useDiscoveredOrders(homeChainId: number, sender?: Address, vault?: Address) {
  const sources = bridgeSourcesForHome(homeChainId);
  // A hook cannot be called per source, so take the first configured one. Today that is
  // BNB Chain; a second source would need this lifted to a component per source.
  const source = sources[0];
  const client = usePublicClient({ chainId: source?.chainId });

  const query = useQuery({
    queryKey: ["discovered-orders", source?.chainId, source?.gateway, sender, vault],
    enabled: Boolean(client && source?.gateway && sender),
    // Deposits are user-initiated and arrive in minutes, so a slow refresh is plenty.
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
    queryFn: () => scanSource(client as PublicClient, source, sender as Address, vault),
  });

  return {
    orders: query.data?.orders ?? [],
    truncated: query.data?.truncated ?? false,
    scannedFrom: query.data?.scannedFrom,
    isLoading: query.isLoading,
    // A public RPC refusing a range is common and not worth alarming anyone over; the
    // panel falls back to local storage and the manual guid input.
    error: query.error ? "Could not read deposit history from the source chain." : null,
  };
}

/**
 * Merge locally-recorded and chain-discovered orders, preferring the local record because
 * it carries the amount as the LP typed it and the true `bridgeBack` choice.
 *
 * Sorting: local records have a real timestamp and sort newest-first. Discovered-only
 * records have no timestamp without an extra call per log, so they follow, ordered by
 * block height. Status for every row is read live from the composer regardless, so this
 * only affects display order.
 */
export function mergeOrders(local: TrackedOrder[], discovered: TrackedOrder[]): TrackedOrder[] {
  const seen = new Set(local.map((o) => o.guid.toLowerCase()));
  const extra = discovered
    .filter((o) => !seen.has(o.guid.toLowerCase()))
    .sort((a, b) => {
      const ab = (a as TrackedOrder & { blockNumber?: bigint }).blockNumber ?? 0n;
      const bb = (b as TrackedOrder & { blockNumber?: bigint }).blockNumber ?? 0n;
      return bb > ab ? 1 : bb < ab ? -1 : 0;
    });
  return [...local, ...extra];
}
