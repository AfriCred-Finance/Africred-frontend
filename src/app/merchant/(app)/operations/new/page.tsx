"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, money, toMinor, type Balance, type Client, type Quote } from "@/lib/merchant";

interface Preview {
  quote: Quote;
  available: string;
  affordable: boolean;
}

/**
 * Create a supplier payment.
 *
 * The merchant states what the supplier receives; every other figure is derived and shown
 * before anything is committed. The preview runs the same checks and the same pricing as
 * the creation itself, so what is on screen is what will be charged.
 *
 * Notably absent: the exchange rate. It is ours to set, shown here and not editable. A
 * field for it would invite a merchant to choose what they are charged at.
 */
export default function NewOperationPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [form, setForm] = useState({
    clientId: "",
    supplierName: "",
    supplierBankAccount: "",
    destinationCountryIso: "CN",
    toAmount: "",
    toCurrency: "CNY",
  });

  const [preview, setPreview] = useState<Preview | null>(null);
  const [pricing, setPricing] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    void (async () => {
      const [c, b] = await Promise.all([
        api<{ results: Client[] }>("me/clients"),
        api<Balance>("me/balance?currency=XOF"),
      ]);
      setClients(c.results.filter((x) => x.active));
      setBalance(b);
    })().catch((e) => setError((e as Error).message));
  }, []);

  const ready = form.clientId && form.supplierName && form.supplierBankAccount && Number(form.toAmount) > 0;

  /**
   * What goes over the wire: the amount in minor units of its currency.
   *
   * The merchant types yuan. The API takes centimes of yuan, because every amount it
   * handles is an integer in minor units. The form used to send what was typed as it was,
   * so 50,000 yuan became 500.00 and the supplier would have been paid a hundredth of the
   * invoice. The screens that DISPLAY amounts already divided correctly, which is why
   * nothing looked wrong until a quote came back a hundred times too cheap.
   */
  const payload = (orderId: string) => ({
    ...form,
    toAmount: toMinor(form.toAmount, form.toCurrency.trim().toUpperCase()),
    orderId,
  });

  const price = useCallback(async () => {
    if (!ready) {
      setPreview(null);
      return;
    }
    setPricing(true);
    setPriceError(null);
    try {
      // A throwaway id: previewing must not reserve one, and the real id is minted on
      // submit so an abandoned form leaves nothing behind.
      setPreview(
        await api<Preview>("me/operations/preview", {
          method: "POST",
          body: JSON.stringify(payload(`preview-${Date.now()}`)),
        }),
      );
    } catch (e) {
      setPreview(null);
      setPriceError((e as Error).message);
    } finally {
      setPricing(false);
    }
  }, [form, ready]);

  // Debounced: the merchant types an amount digit by digit, and pricing every keystroke
  // would show a figure for "1" before they finish typing "100000".
  useEffect(() => {
    const t = setTimeout(() => void price(), 400);
    return () => clearTimeout(t);
  }, [price]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const orderId = `TP-${form.destinationCountryIso}-${Date.now()}`;
      await api("me/operations", { method: "POST", body: JSON.stringify(payload(orderId)) });
      router.push(`/merchant/operations/${encodeURIComponent(orderId)}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (clients.length === 0 && !error) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold tracking-tight">Add a client first</h1>
        <p className="mt-2 text-sm text-ink2">
          A payment is made on behalf of one of your clients, so there is nothing to pay from yet.
        </p>
        <Link href="/merchant/clients" className="btn btn-primary mt-4 inline-block">
          Add a client
        </Link>
      </div>
    );
  }

  const q = preview?.quote;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New payment</h1>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card space-y-4 p-5">
          <label className="block">
            <span className="label">Client</span>
            <select className="input mt-1 w-full" required value={form.clientId} onChange={set("clientId")}>
              <option value="">Choose a client</option>
              {clients.map((c) => (
                <option key={c.clientId} value={c.clientId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Supplier</span>
              <input className="input mt-1 w-full" required value={form.supplierName} onChange={set("supplierName")} />
            </label>
            <label className="block">
              <span className="label">Destination</span>
              <input
                className="input mt-1 w-full"
                required
                value={form.destinationCountryIso}
                onChange={set("destinationCountryIso")}
              />
            </label>
          </div>

          <label className="block">
            <span className="label">Supplier bank account</span>
            <input
              className="input mt-1 w-full"
              required
              value={form.supplierBankAccount}
              onChange={set("supplierBankAccount")}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">
                Amount the supplier receives{form.toCurrency ? ` (${form.toCurrency.toUpperCase()})` : ""}
              </span>
              <input
                className="input mt-1 w-full"
                inputMode="decimal"
                required
                value={form.toAmount}
                onChange={set("toAmount")}
              />
            </label>
            <label className="block">
              <span className="label">Currency</span>
              <input className="input mt-1 w-full" required value={form.toCurrency} onChange={set("toCurrency")} />
            </label>
          </div>
        </div>

        {/* The cost, computed by the same code that will charge it. */}
        <div className="card h-fit space-y-4 p-5">
          <h2 className="font-medium">Cost</h2>

          {!ready && <p className="text-sm text-muted">Fill in the payment to see the cost.</p>}
          {ready && pricing && !q && <p className="text-sm text-muted">Pricing...</p>}
          {priceError && <p className="text-sm text-red-700">{priceError}</p>}

          {q && (
            <>
              <dl className="space-y-2 text-sm">
                <Row label="Transfer amount" value={money(q.baseAmount, q.fiatCurrency)} />
                <Row label="Exchange commission" value={money(q.fxCommission, q.fiatCurrency)} />
                <Row label="Transfer commission" value={money(q.transferCommission, q.fiatCurrency)} />
                <Row label="Tax" value={money(q.tax, q.fiatCurrency)} />
                <div className="hairline border-t pt-2">
                  <Row label="Total cost" value={money(q.totalCost, q.fiatCurrency)} />
                </div>
                <div className="hairline border-t pt-2 font-medium text-ink">
                  <Row label="Total to pay" value={money(q.totalAmount, q.fiatCurrency)} />
                </div>
              </dl>

              <p className="text-xs text-muted">
                Available: {money(preview.available, q.fiatCurrency)}
              </p>

              {!preview.affordable && (
                <p className="text-sm text-red-700">
                  Not enough on your balance. Make a deposit to cover this payment.
                </p>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={!q || !preview?.affordable || submitting}
          >
            {submitting ? "Creating..." : "Create payment"}
          </button>
          <p className="text-xs text-muted">
            The amount is held on your balance and only spent once the supplier is paid.
          </p>
        </div>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
