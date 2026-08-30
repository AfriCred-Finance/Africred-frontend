"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Stat } from "@/components/Stat";
import {
  api,
  kybMessage,
  money,
  type Balance,
  type Merchant,
  type Operation,
} from "@/lib/merchant";

export default function DashboardPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // No merchant id is sent anywhere: the API takes the tenant from the session.
        const [m, b, ops] = await Promise.all([
          api<Merchant>("me/merchant"),
          api<Balance>("me/balance?currency=XOF"),
          api<{ results: Operation[] }>("orders"),
        ]);
        setMerchant(m);
        setBalance(b);
        setOperations(ops.results.slice(0, 5));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  if (error) {
    return <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>;
  }
  if (!merchant || !balance) {
    return <div className="card p-6 text-sm text-muted">Loading...</div>;
  }

  const kyb = kybMessage(merchant.kybState, merchant.kybRejectionReason);
  const approved = merchant.kybState === "approved";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{merchant.legalName}</h1>
        <p className="mt-1 text-sm text-ink2">
          {merchant.city}, {merchant.countryIso}
        </p>
      </div>

      {/*
        Shown before anything else when the account is not cleared. A merchant who cannot
        yet pay should learn it here, not by filling in a payment form and being refused
        at the end of it.
      */}
      {!approved && (
        <div
          className={`card p-5 ${
            kyb.tone === "bad" ? "border-red-500/30" : "border-accent/40"
          }`}
        >
          <h2 className={`font-medium ${kyb.tone === "bad" ? "text-red-700" : "text-ink"}`}>
            {kyb.title}
          </h2>
          <p className="mt-1 text-sm text-ink2">{kyb.detail}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Available"
          value={money(balance.available, balance.currency)}
          sub="what you can spend now"
        />
        <Stat
          label="Committed"
          value={money(balance.reserved, balance.currency)}
          sub="held for payments in progress"
        />
        <Stat label="Total balance" value={money(balance.balance, balance.currency)} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/merchant/operations/new"
          className={`btn btn-primary ${approved ? "" : "pointer-events-none opacity-50"}`}
          aria-disabled={!approved}
        >
          New payment
        </Link>
        <Link href="/merchant/clients" className="btn btn-secondary">
          Manage clients
        </Link>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Recent payments</h2>
          <Link href="/merchant/operations" className="text-sm text-ink3 hover:text-ink2">
            See all
          </Link>
        </div>

        <div className="card divide-y divide-ink/10">
          {operations.length === 0 && (
            <div className="p-6 text-sm text-muted">No payments yet.</div>
          )}
          {operations.map((o) => (
            <Link
              key={o.orderId}
              href={`/merchant/operations/${encodeURIComponent(o.orderId)}`}
              className="flex items-center justify-between gap-4 p-4 hover:bg-ink/5"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{o.supplierName}</div>
                <div className="truncate text-xs text-muted">
                  {o.clientName} · {new Date(o.createdAt).toLocaleDateString("fr-FR")}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm">{money(o.toAmount, o.toCurrency)}</div>
                <div className="text-xs text-muted">{labelFor(o)}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * What state to show a merchant.
 *
 * Their words, not ours: they care whether the supplier has the money, not what the
 * internal record is called.
 */
function labelFor(o: Operation): string {
  if (o.state === "cancelled") return "Cancelled";
  if (o.payout?.state === "failed") return "Failed";
  if (o.payout?.settledAt) return "Completed";
  if (o.payout?.drawTxHash) return "Supplier paid";
  return "In progress";
}
