"use client";

import { useEffect, useState } from "react";
import { Stat } from "@/components/Stat";
import { api, money, type Balance, type Deposit } from "@/lib/merchant";

/**
 * The merchant's deposits.
 *
 * Read-only, and deliberately so. A merchant hands over cash at an office or sends a
 * transfer; we confirm it. A screen that let them declare their own deposits would be a
 * screen that lets them credit themselves.
 */
export default function DepositsPage() {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [d, b] = await Promise.all([
          api<{ results: Deposit[] }>("me/deposits"),
          api<Balance>("me/balance?currency=XOF"),
        ]);
        setDeposits(d.results);
        setBalance(b);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Deposits</h1>

      {balance && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Available" value={money(balance.available, balance.currency)} />
          <Stat label="Committed" value={money(balance.reserved, balance.currency)} />
          <Stat label="Total balance" value={money(balance.balance, balance.currency)} />
        </div>
      )}

      <div className="card p-5 text-sm text-ink2">
        To add funds, make a transfer to our account or bring cash to one of our offices.
        Your balance is credited once we confirm it.
      </div>

      {error && <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>}

      <div className="card divide-y divide-ink/10">
        {loaded && deposits.length === 0 && (
          <div className="p-6 text-sm text-muted">No deposits yet.</div>
        )}
        {deposits.map((d) => (
          <div key={d.depositId} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="truncate font-medium">
                {d.method === "cash" ? "Cash" : "Bank transfer"}
              </div>
              <div className="truncate text-xs text-muted">
                {/* Whichever reference exists: cash has a receipt, a transfer has a bank
                    reference, and each is the only trail that method leaves. */}
                {[d.receiptNumber, d.bankReference].filter(Boolean).join(" · ") || "—"} ·{" "}
                {new Date(d.createdAt).toLocaleDateString("fr-FR")}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm">{money(d.amount, d.currency)}</div>
              <div className="text-xs text-muted">{stateLabel(d)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function stateLabel(d: Deposit): string {
  if (d.state === "confirmed") return "Credited";
  if (d.state === "rejected") return "Rejected";
  return "Awaiting confirmation";
}
