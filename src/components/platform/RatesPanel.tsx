"use client";

import { useCallback, useEffect, useState } from "react";
import { listRates, publishRate, type ReferenceRate } from "@/lib/platform";

/**
 * Reference rates: the number every quote in a corridor is priced from.
 *
 * Append-only by design. Publishing a rate does not edit the old one, it supersedes it,
 * so a quote given last week can still be explained by the rate that was in force when it
 * was given. That is why this screen shows a history rather than an editable field.
 */
const CORRIDORS = [
  { fiat: "XOF", to: "CNY" },
  { fiat: "XOF", to: "EUR" },
  { fiat: "XOF", to: "USD" },
] as const;

export function RatesPanel() {
  const [rates, setRates] = useState<ReferenceRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRates(await listRates());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-8">
      <p className="text-sm text-ink2">
        What a merchant is quoted at. They read it, they never set it.
      </p>

      {error && <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>}

      <PublishForm onDone={refresh} />

      <div>
        <h3 className="mb-3 font-medium">Published</h3>
        <div className="card divide-y divide-ink/10">
          {!rates && <div className="p-6 text-sm text-muted">Loading...</div>}
          {rates?.length === 0 && (
            <div className="p-6 text-sm text-muted">No rate published yet.</div>
          )}
          {rates?.map((r) => (
            <div
              key={`${r.corridor}-${r.effectiveFrom}-${r.createdAt}`}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <div className="font-medium">{r.corridor}</div>
                {/* Who set it and why. A rate nobody can attribute is a rate nobody can defend. */}
                <div className="truncate text-xs text-muted">{r.source}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="num font-mono text-sm">{r.rate}</div>
                <div className="text-xs text-muted">
                  from {new Date(r.effectiveFrom).toLocaleDateString("fr-FR")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PublishForm({ onDone }: { onDone: () => void }) {
  const [corridor, setCorridor] = useState(0);
  const [rate, setRate] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const c = CORRIDORS[corridor];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await publishRate({ fiatCurrency: c.fiat, toCurrency: c.to, rate: rate.trim(), source });
      setRate("");
      setSource("");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <div className="font-medium">Publish a rate</div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">Corridor</span>
          <select
            className="input mt-1 w-full"
            value={corridor}
            onChange={(e) => setCorridor(Number(e.target.value))}
          >
            {CORRIDORS.map((x, i) => (
              <option key={`${x.fiat}-${x.to}`} value={i}>
                {x.fiat} to {x.to}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label">Rate</span>
          <input
            className="input mt-1 w-full"
            inputMode="numeric"
            required
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="1220000"
          />
        </label>

        <label className="block">
          <span className="label">Source</span>
          <input
            className="input mt-1 w-full"
            required
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="treasury desk, today"
          />
        </label>
      </div>

      {/*
        Spelled out because this is the field that gets entered wrong. Both sides are in
        minor units, and XOF has none while CNY has two, so a rate between whole currencies
        is a hundred times off. A quote priced from it would be wrong by the same factor
        and would still look plausible.
      */}
      <p className="text-xs text-muted">
        Destination units per local unit, scaled by 1e6, in minor units on both sides. XOF
        has no minor unit and CNY has two, so 0.0122 CNY per franc is 1.22 CNY-cents per
        franc: the figure is 1220000, not 12200.
      </p>

      {error && <div className="text-sm text-red-700">{error}</div>}

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Publishing..." : "Publish"}
      </button>
    </form>
  );
}
