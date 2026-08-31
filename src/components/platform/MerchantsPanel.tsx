"use client";

import { useCallback, useEffect, useState } from "react";
import { api, money, type Balance } from "@/lib/merchant";
import { TransferScorePanel } from "./TransferScorePanel";
import {
  KYB_LABEL,
  KYB_TONE,
  approveMerchant,
  getMerchant,
  kybActions,
  listDeposits,
  listMerchants,
  rejectMerchant,
  startReview,
  suspendMerchant,
  type KybState,
  type PlatformDeposit,
  type PlatformMerchant,
} from "@/lib/platform";

/**
 * Merchant verification: the queue, and the verdict on one file.
 *
 * Queue and file are one component with a selection rather than two routes, because this
 * panel lives inside the admin console's tabs. A drill-down that changed the URL would
 * take the surrounding tab state with it.
 */
const TABS: Array<{ key: KybState | "all"; label: string }> = [
  { key: "submitted", label: "Awaiting review" },
  { key: "under_review", label: "Under review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export function MerchantsPanel({ onDeposits }: { onDeposits: (merchantId: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);

  return selected ? (
    <MerchantFile
      merchantId={selected}
      onBack={() => setSelected(null)}
      onDeposits={onDeposits}
    />
  ) : (
    <MerchantQueue onOpen={setSelected} />
  );
}

// ------------------------------------------------------------------------------- queue

function MerchantQueue({ onOpen }: { onOpen: (id: string) => void }) {
  // Opens on the files that are waiting rather than on everything: a reviewer arrives to
  // clear a backlog, not to browse a directory. "All" is one click away for a lookup.
  const [tab, setTab] = useState<KybState | "all">("submitted");
  const [rows, setRows] = useState<PlatformMerchant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    listMerchants(tab === "all" ? undefined : tab)
      .then(setRows)
      .catch((e) => setError((e as Error).message));
  }, [tab]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink2">
        A merchant cannot create a payment until their file is approved.
      </p>

      <div className="card inline-flex items-stretch overflow-hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`px-4 py-2.5 text-sm transition-colors ${
              tab === t.key ? "text-ink" : "text-ink3 hover:text-ink2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>}
      {!rows && !error && <div className="card p-6 text-sm text-muted">Loading...</div>}

      {rows && (
        <div className="card divide-y divide-ink/10">
          {rows.length === 0 && <div className="p-6 text-sm text-muted">Nothing here.</div>}
          {rows.map((m) => (
            <button
              key={m.merchantId}
              type="button"
              onClick={() => onOpen(m.merchantId)}
              className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-ink/5"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{m.legalName}</div>
                <div className="truncate text-xs text-muted">
                  {m.email} · {m.city}, {m.countryIso}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className={`tag ${KYB_TONE[m.kybState]}`}>{KYB_LABEL[m.kybState]}</span>
                <div className="mt-1 text-xs text-muted">
                  {/*
                    Submission date, not creation date. How long a file has been waiting on
                    us is the number a reviewer is accountable for.
                  */}
                  {m.kybSubmittedAt
                    ? `submitted ${new Date(m.kybSubmittedAt).toLocaleDateString("fr-FR")}`
                    : "not submitted"}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------- file

function MerchantFile({
  merchantId,
  onBack,
  onDeposits,
}: {
  merchantId: string;
  onBack: () => void;
  onDeposits: (merchantId: string) => void;
}) {
  const [merchant, setMerchant] = useState<PlatformMerchant | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [deposits, setDeposits] = useState<PlatformDeposit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const [m, b, d] = await Promise.all([
        getMerchant(merchantId),
        api<Balance>(`me/balance?currency=XOF&merchantId=${encodeURIComponent(merchantId)}`),
        listDeposits(merchantId),
      ]);
      setMerchant(m);
      setBalance(b);
      setDeposits(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [merchantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(kind: "review" | "approve" | "reject" | "suspend") {
    // Asked for before the call, not after a failure: the API rejects a blank reason, and
    // discovering that having already clicked "reject" reads as the action having failed.
    if ((kind === "reject" || kind === "suspend") && reason.trim() === "") {
      setError(`A ${kind === "reject" ? "rejection" : "suspension"} needs a reason.`);
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      if (kind === "review") await startReview(merchantId);
      if (kind === "approve") await approveMerchant(merchantId);
      if (kind === "reject") await rejectMerchant(merchantId, reason.trim());
      if (kind === "suspend") await suspendMerchant(merchantId, reason.trim());
      setReason("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!merchant) {
    return error ? (
      <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>
    ) : (
      <div className="card p-6 text-sm text-muted">Loading...</div>
    );
  }

  const actions = kybActions(merchant.kybState);
  const needsReason = actions.includes("reject") || actions.includes("suspend");

  return (
    <div className="space-y-8">
      <div>
        <button type="button" onClick={onBack} className="text-sm text-ink3 hover:text-ink2">
          &larr; All merchants
        </button>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{merchant.legalName}</h2>
          <span className={`tag ${KYB_TONE[merchant.kybState]}`}>
            {KYB_LABEL[merchant.kybState]}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink2">{merchant.merchantId}</p>
      </div>

      {error && <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>}

      {merchant.kybRejectionReason && (
        <div className="card border-red-500/30 p-5">
          <div className="text-sm font-medium text-red-700">Reason on file</div>
          <p className="mt-1 text-sm text-ink2">{merchant.kybRejectionReason}</p>
        </div>
      )}

      {actions.length > 0 && (
        <div className="card p-5">
          <div className="font-medium">Verdict</div>
          {needsReason && (
            <label className="mt-4 block">
              <span className="label">Reason (required to reject or suspend)</span>
              <input
                className="input mt-1 w-full"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What is missing, in words the merchant can act on"
              />
            </label>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {actions.includes("review") && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy !== null}
                onClick={() => act("review")}
              >
                {busy === "review" ? "..." : "Take for review"}
              </button>
            )}
            {actions.includes("approve") && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => act("approve")}
              >
                {busy === "approve" ? "..." : "Approve"}
              </button>
            )}
            {actions.includes("reject") && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy !== null}
                onClick={() => act("reject")}
              >
                {busy === "reject" ? "..." : "Reject"}
              </button>
            )}
            {actions.includes("suspend") && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy !== null}
                onClick={() => act("suspend")}
              >
                {busy === "suspend" ? "..." : "Suspend"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="font-medium">Company</div>
          <dl className="mt-4 space-y-2 text-sm">
            <Row k="Contact" v={`${merchant.contactFirstName} ${merchant.contactLastName}`} />
            <Row k="Email" v={merchant.email} />
            <Row k="Phone" v={merchant.phone} />
            <Row
              k="Address"
              v={`${merchant.addressLine}, ${merchant.city}, ${merchant.countryIso}`}
            />
            <Row k="Bank" v={merchant.bankName ?? "-"} />
            <Row k="Account" v={merchant.bankAccount} />
          </dl>
        </div>

        <div className="card p-5">
          <div className="font-medium">File</div>
          <dl className="mt-4 space-y-2 text-sm">
            <Row k="Created" v={new Date(merchant.createdAt).toLocaleString("fr-FR")} />
            <Row
              k="Submitted"
              v={
                merchant.kybSubmittedAt
                  ? new Date(merchant.kybSubmittedAt).toLocaleString("fr-FR")
                  : "-"
              }
            />
            <Row
              k="Reviewed"
              v={
                merchant.kybReviewedAt
                  ? new Date(merchant.kybReviewedAt).toLocaleString("fr-FR")
                  : "-"
              }
            />
            {/* Who decided. A verdict with no author cannot be questioned later. */}
            <Row k="Reviewed by" v={merchant.kybReviewedBy ?? "-"} />
            <Row
              k="Balance"
              v={balance ? `${money(balance.available, balance.currency)} available` : "-"}
            />
          </dl>
          {/*
            Documents are stored against the merchant but there is no platform route to
            list or fetch them yet, and they need a private bucket with short-lived signed
            URLs rather than a public link. Saying so beats an empty panel that looks like
            the merchant uploaded nothing.
          */}
          <p className="mt-4 text-xs text-muted">
            Uploaded documents are not viewable here yet: they need the private document
            store and signed URLs.
          </p>
        </div>
      </div>

      {/*
        Only for an approved merchant. Scoring one who cannot yet trade would report a
        thin file as a weak client, when the real answer is that nothing has happened yet.
      */}
      {merchant.kybState === "approved" && (
        <div>
          <h3 className="mb-1 font-medium">Transfer score</h3>
          <p className="mb-3 text-sm text-ink2">
            Per client, not per merchant: this measures a trading relationship, and the
            same merchant can serve a reliable importer and a first-time buyer at once.
          </p>
          <TransferScorePanel merchantId={merchantId} />
        </div>
      )}

      <div>
        <h3 className="mb-3 font-medium">Deposits</h3>
        <div className="card divide-y divide-ink/10">
          {deposits.length === 0 && (
            <div className="p-6 text-sm text-muted">No deposits recorded.</div>
          )}
          {deposits.map((d) => (
            <div key={d.depositId} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="truncate font-medium">{money(d.amount, d.currency)}</div>
                <div className="truncate text-xs text-muted">
                  {d.method === "cash" ? "Cash" : "Bank transfer"} ·{" "}
                  {d.receiptNumber ?? d.bankReference ?? d.depositId}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted">
                <div>{d.state}</div>
                <div>{new Date(d.createdAt).toLocaleDateString("fr-FR")}</div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onDeposits(merchant.merchantId)}
          className="mt-3 text-sm text-ink3 hover:text-ink2"
        >
          Record or attest a deposit &rarr;
        </button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="truncate text-right">{v}</dd>
    </div>
  );
}
