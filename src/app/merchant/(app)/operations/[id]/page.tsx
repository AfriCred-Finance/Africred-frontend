"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Stat } from "@/components/Stat";
import { api, money, paymentStatus, type Operation, type Quote } from "@/lib/merchant";

interface Detail {
  intake: Operation & { quoteJson: string | null; fundingDepositId: string | null };
  payout: {
    state: string;
    drawTxHash: string | null;
    settledAt: string | null;
    cedarPayoutStatus: string | null;
    lastError: string | null;
  } | null;
}

const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://basescan.org";

export default function OperationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = decodeURIComponent(params.id);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await api<Detail>(`orders/${encodeURIComponent(id)}`));
    } catch (e) {
      // Another merchant's order reads as missing rather than forbidden, which is what the
      // API answers on purpose: "forbidden" would confirm it exists.
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>;
  if (!detail) return <div className="card p-6 text-sm text-muted">Loading...</div>;

  const { intake, payout } = detail;
  // The quote as it was accepted, never recomputed: rates move, and the charge must stay
  // explainable with the figures the merchant agreed to.
  const quote = intake.quoteJson ? (JSON.parse(intake.quoteJson) as Quote) : null;
  const paid = Boolean(payout?.drawTxHash);
  const cancellable = intake.state !== "cancelled" && intake.state !== "consumed" && !paid;

  async function cancel() {
    setBusy(true);
    try {
      await api(`me/operations/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      await load();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/merchant/operations" className="btn btn-ghost">
          Back
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{intake.supplierName}</h1>
        <span className="rounded-full border border-ink/20 px-2.5 py-0.5 text-xs text-ink3">
          {paymentStatus({ ...intake, payout })}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Client" value={intake.clientName} />
        <Stat label="Supplier receives" value={money(intake.toAmount, intake.toCurrency)} />
        <Stat label="You paid" value={money(intake.fiatExpected, intake.fiatCurrency)} />
        <Stat label="Reference" value={intake.orderId} />
      </div>

      {quote && (
        <div className="card p-5">
          <h2 className="font-medium">Cost breakdown</h2>
          <p className="mt-1 text-xs text-muted">
            The figures you accepted when this payment was created.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Transfer amount" value={money(quote.baseAmount, quote.fiatCurrency)} />
            <Row label="Exchange commission" value={money(quote.fxCommission, quote.fiatCurrency)} />
            <Row label="Transfer commission" value={money(quote.transferCommission, quote.fiatCurrency)} />
            <Row label="Tax" value={money(quote.tax, quote.fiatCurrency)} />
            <div className="hairline border-t pt-2">
              <Row label="Total cost" value={money(quote.totalCost, quote.fiatCurrency)} />
            </div>
            <div className="hairline border-t pt-2 font-medium text-ink">
              <Row label="Total" value={money(quote.totalAmount, quote.fiatCurrency)} />
            </div>
          </dl>
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-medium">Progress</h2>
        <ol className="mt-3 space-y-2 text-sm">
          <Step done label="Payment created" detail={new Date(intake.createdAt).toLocaleString("fr-FR")} />
          <Step done={paid} label="Sent to the supplier's bank" />
          <Step
            done={Boolean(payout?.settledAt)}
            label="Completed"
            detail={payout?.cedarPayoutStatus ?? undefined}
          />
        </ol>

        {/*
          The transaction reference appears here and nowhere else. A merchant does not need
          it to trust the payment, but it is theirs to check if they want to.
        */}
        {payout?.drawTxHash && (
          <p className="mt-4 text-sm">
            <span className="text-muted">Transaction reference </span>
            <a
              className="underline"
              href={`${EXPLORER}/tx/${payout.drawTxHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {payout.drawTxHash.slice(0, 18)}...
            </a>
          </p>
        )}

        {payout?.lastError && <p className="mt-4 text-sm text-red-700">{payout.lastError}</p>}
      </div>

      {cancellable && (
        <div className="card p-5">
          <h2 className="font-medium">Cancel this payment</h2>
          <p className="mt-1 text-sm text-ink2">
            The amount held on your balance is released. Nothing has been sent yet.
          </p>
          <button type="button" className="btn btn-secondary mt-4" onClick={cancel} disabled={busy}>
            {busy ? "Cancelling..." : "Cancel payment"}
          </button>
        </div>
      )}
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

function Step({ done, label, detail }: { done: boolean; label: string; detail?: string }) {
  return (
    <li className="flex gap-3">
      <span className={done ? "text-accent" : "text-ink3"}>{done ? "done" : "pending"}</span>
      <span className="text-ink">{label}</span>
      {detail && <span className="truncate text-muted">{detail}</span>}
    </li>
  );
}
