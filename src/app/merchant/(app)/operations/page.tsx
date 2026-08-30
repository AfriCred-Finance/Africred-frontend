"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money, paymentStatus, type Operation } from "@/lib/merchant";

export default function OperationsPage() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        // Scoped by the session, so this can only ever be their own list.
        setOperations((await api<{ results: Operation[] }>("orders")).results);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <Link href="/merchant/operations/new" className="btn btn-primary">
          New payment
        </Link>
      </div>

      {error && <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>}

      <div className="card divide-y divide-ink/10">
        {loaded && operations.length === 0 && (
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
                {o.clientName} · {new Date(o.createdAt).toLocaleDateString("fr-FR")} · {o.orderId}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm">{money(o.toAmount, o.toCurrency)}</div>
              <div className="text-xs text-muted">{paymentStatus(o)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
