"use client";

import type { Address } from "viem";

import type { ConfiguredChainId, SupportedChainId } from "./contracts";

/**
 * Local record of cross-chain deposits an LP has sent.
 *
 * This exists because the composer keys everything on the LayerZero `guid`, and a guid
 * is not discoverable from an address alone — there is no `ordersOf(account)` on-chain.
 * If an LP loses the guid they lose the handle on a parked deposit, so the UI keeps its
 * own list and re-reads the authoritative status from the composer on every render.
 *
 * Treat this as a convenience index, never as truth. It is per-browser, so an LP who
 * clears storage or switches device needs the guid from their BNB transaction. The
 * panel surfaces the guid and the source tx for exactly that reason.
 */
export type TrackedOrder = {
  guid: `0x${string}`;
  vault: Address;
  receiver: Address;
  /// Chain the deposit was sent FROM.
  srcChainId: ConfiguredChainId;
  /// Chain it settles ON, and where the composer holds it if it could not complete.
  homeChainId: SupportedChainId;
  /// Human-readable amount as typed, kept only for display in the history list.
  amount: string;
  tokenSymbol: string;
  txHash: `0x${string}`;
  bridgeBack: boolean;
  createdAt: number;
};

const KEY = "africred.crosschain.orders.v1";

function read(): TrackedOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrackedOrder[]) : [];
  } catch {
    // Corrupt or unreadable storage should never take the page down; an LP can always
    // recover from the guid in their source transaction.
    return [];
  }
}

function write(orders: TrackedOrder[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(orders));
  } catch {
    /* storage full or blocked — non-fatal */
  }
}

/** All tracked orders for a receiver, newest first. */
export function loadOrders(receiver?: Address): TrackedOrder[] {
  if (!receiver) return [];
  const target = receiver.toLowerCase();
  return read()
    .filter((o) => o.receiver.toLowerCase() === target)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Orders for one receiver against one vault, newest first. */
export function loadOrdersForVault(receiver?: Address, vault?: Address): TrackedOrder[] {
  if (!vault) return loadOrders(receiver);
  const target = vault.toLowerCase();
  return loadOrders(receiver).filter((o) => o.vault.toLowerCase() === target);
}

export function saveOrder(order: TrackedOrder) {
  const existing = read().filter((o) => o.guid.toLowerCase() !== order.guid.toLowerCase());
  write([order, ...existing].slice(0, 100));
}

export function removeOrder(guid: string) {
  write(read().filter((o) => o.guid.toLowerCase() !== guid.toLowerCase()));
}

/// Matches AfriCredComposer.Status.
export type OrderStatus = "none" | "pending" | "awaitingBridge" | "settled" | "refunded";

export function orderStatusFrom(raw: number): OrderStatus {
  switch (raw) {
    case 1:
      return "pending";
    case 2:
      return "awaitingBridge";
    case 3:
      return "settled";
    case 4:
      return "refunded";
    default:
      return "none";
  }
}

/**
 * What each status means to the LP, in their terms rather than the contract's.
 *
 * `none` is the interesting one: the composer has no record, which almost always means
 * the message is still crossing rather than that anything is wrong. Saying "failed"
 * here would be both wrong and alarming.
 */
export function orderStatusLabel(status: OrderStatus): { label: string; hint: string; tone: "wait" | "action" | "done" } {
  switch (status) {
    case "pending":
      return {
        label: "Waiting on the vault",
        hint: "Funds arrived but the vault would not accept the deposit yet. Retry once its funding window is open, or take a refund on the home chain.",
        tone: "action",
      };
    case "awaitingBridge":
      return {
        label: "Shares waiting",
        hint: "The deposit went through. The shares could not be bridged back, so either pay for the bridge yourself or hold them on the home chain.",
        tone: "action",
      };
    case "settled":
      return { label: "Settled", hint: "Fully delivered.", tone: "done" };
    case "refunded":
      return { label: "Refunded", hint: "The bridged stable was returned to you on the home chain.", tone: "done" };
    default:
      return {
        label: "In transit",
        hint: "The message has not been delivered yet. Bridging usually takes a few minutes.",
        tone: "wait",
      };
  }
}
