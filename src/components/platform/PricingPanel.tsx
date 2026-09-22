"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/merchant";

/**
 * A merchant's commercial terms, and the history of every change to them.
 *
 * Before this the only grid that ever existed came from the seed script, so a merchant
 * approved through the console was refused on their first payment. Approval now applies
 * the standard terms; this is where staff see them and change them.
 *
 * Entered as percentages and francs, stored as basis points and minor units. Nobody
 * negotiates in basis points, and a field asking for "150" when the operator means 1.5%
 * is how a merchant ends up charged a hundred times too much.
 */
interface Grid {
  version: string;
  fxSpreadBps: string;
  transferFeeBps: string;
  transferFeeFixed: string;
  taxBps: string;
  minTransferFee: string;
  maxTransferFee: string;
  fiatCurrency: string;
  effectiveFrom: string;
}

const pct = (bps: string) => `${(Number(bps) / 100).toLocaleString("fr-FR")} %`;
const xof = (v: string) =>
  Number(v) === 0 ? "none" : `${Number(v).toLocaleString("fr-FR")} XOF`;
/** 1.5 -> "150". Rounded, because 1.005% typed by hand should not become 100.49999. */
const toBps = (percent: string) => String(Math.round(Number(percent.replace(",", ".")) * 100));

export function PricingPanel({ merchantId }: { merchantId: string }) {
  const [active, setActive] = useState<Grid | null>(null);
  const [history, setHistory] = useState<Grid[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ active: Grid | null; history: Grid[] }>(
        `platform/merchants/${encodeURIComponent(merchantId)}/pricing`,
      );
      setActive(r.active);
      setHistory(r.history);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [merchantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">Pricing</div>
          <p className="mt-1 text-xs text-muted">
            What this merchant pays on each payment. Changes apply to new payments only.
          </p>
        </div>
        {!editing && (
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            {active ? "Change terms" : "Set terms"}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {!active && !editing && (
        <p className="mt-3 text-sm text-ink2">
          No terms in force. This merchant cannot create a payment until they are set.
        </p>
      )}

      {active && !editing && (
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row k="Exchange margin" v={pct(active.fxSpreadBps)} />
          <Row k="Transfer fee" v={`${pct(active.transferFeeBps)} + ${xof(active.transferFeeFixed)}`} />
          <Row k="Tax on our fees" v={pct(active.taxBps)} />
          <Row k="Transfer fee floor" v={xof(active.minTransferFee)} />
          <Row k="Transfer fee ceiling" v={xof(active.maxTransferFee)} />
          <Row k="Version" v={`${active.version}, since ${new Date(active.effectiveFrom).toLocaleDateString("fr-FR")}`} />
        </dl>
      )}

      {editing && (
        <TermsForm
          merchantId={merchantId}
          current={active}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
          }}
        />
      )}

      {/*
        The history stays visible. A dispute about a fee is settled by what was in force on
        the day, and every past version is still what priced the payments made under it.
      */}
      {history.length > 1 && (
        <details className="mt-4 text-xs text-muted">
          <summary className="cursor-pointer">{history.length} versions</summary>
          <ul className="mt-2 space-y-1">
            {history.map((g) => (
              <li key={g.version} className="font-mono">
                {g.version} · {new Date(g.effectiveFrom).toLocaleString("fr-FR")} · change{" "}
                {pct(g.fxSpreadBps)} · transfer {pct(g.transferFeeBps)} + {xof(g.transferFeeFixed)} ·
                tax {pct(g.taxBps)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function TermsForm({
  merchantId,
  current,
  onCancel,
  onSaved,
}: {
  merchantId: string;
  current: Grid | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const start = (bps: string | undefined, fallback: string) =>
    bps !== undefined ? String(Number(bps) / 100) : fallback;
  const [fx, setFx] = useState(start(current?.fxSpreadBps, "1.5"));
  const [transfer, setTransfer] = useState(start(current?.transferFeeBps, "1"));
  const [fixed, setFixed] = useState(current?.transferFeeFixed ?? "5000");
  const [tax, setTax] = useState(start(current?.taxBps, "18"));
  const [min, setMin] = useState(current?.minTransferFee ?? "0");
  const [max, setMax] = useState(current?.maxTransferFee ?? "0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`platform/merchants/${encodeURIComponent(merchantId)}/pricing`, {
        method: "POST",
        body: JSON.stringify({
          fxSpreadBps: toBps(fx),
          transferFeeBps: toBps(transfer),
          transferFeeFixed: String(Math.round(Number(fixed))),
          taxBps: toBps(tax),
          minTransferFee: String(Math.round(Number(min))),
          maxTransferFee: String(Math.round(Number(max))),
        }),
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Exchange margin (%)" value={fx} onChange={setFx} />
        <Field label="Transfer fee (%)" value={transfer} onChange={setTransfer} />
        <Field label="Transfer fee, fixed (XOF)" value={fixed} onChange={setFixed} />
        <Field label="Tax on our fees (%)" value={tax} onChange={setTax} />
        <Field label="Transfer fee floor (XOF, 0 = none)" value={min} onChange={setMin} />
        <Field label="Transfer fee ceiling (XOF, 0 = none)" value={max} onChange={setMax} />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-muted">
        Saved as a new version. Payments already created keep the terms they were priced with.
      </p>
      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving..." : "Save new terms"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="input mt-1 w-full"
        inputMode="decimal"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
