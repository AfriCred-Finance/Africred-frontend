"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/merchant";
import {
  BAND_TONE,
  DIMENSION_LABEL,
  saveScore,
  scoreFor,
  type TransferScore,
} from "@/lib/platform";

/**
 * A merchant's clients, scored.
 *
 * The score is per client, not per merchant: it measures a trading relationship, and one
 * merchant can serve a reliable importer and a first-time buyer at once. Averaging them
 * would describe neither.
 *
 * Two numbers are shown together everywhere, and that is the point of the model. The score
 * is computed over dimensions there is data for, and `coverage` says how much of the model
 * that was. A high score at 30% coverage is a guess with a confident face on it, so the
 * console never shows one without the other.
 */
interface Client {
  clientId: string;
  name: string;
}

export function TransferScorePanel({ merchantId }: { merchantId: string }) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ results: Client[] }>(`me/clients?merchantId=${encodeURIComponent(merchantId)}`)
      .then((r) => setClients(r.results))
      .catch((e) => setError((e as Error).message));
  }, [merchantId]);

  if (error) {
    return <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>;
  }
  if (!clients) return <div className="card p-6 text-sm text-muted">Loading...</div>;
  if (clients.length === 0) {
    return (
      <div className="card p-6 text-sm text-muted">
        This merchant has no clients yet, so there is nothing to score.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {clients.map((c) => (
        <ClientScore key={c.clientId} client={c} merchantId={merchantId} />
      ))}
    </div>
  );
}

function ClientScore({ client, merchantId }: { client: Client; merchantId: string }) {
  const [score, setScore] = useState<TransferScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setScore(await scoreFor(client.clientId, merchantId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [client.clientId, merchantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="card border-red-500/30 p-4 text-sm text-red-700">
        {client.name}: {error}
      </div>
    );
  }
  if (!score) return <div className="card p-4 text-sm text-muted">{client.name}...</div>;

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  // Which of the two bounds actually decided. The whole design turns on the lower one
  // winning, so the console says which, rather than showing a ratio with no provenance.
  const cappedByData = score.confidenceCap < score.bandRatio;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium">{client.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={`tag ${BAND_TONE[score.band] ?? "border-line text-muted"}`}>
              {score.band}
            </span>
            <span className="text-muted">
              {score.score} / 1000 at {pct(score.coverage)} coverage
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="num font-mono text-2xl tracking-tight">
            {pct(score.financingRatio)}
          </div>
          <div className="text-xs text-muted">advanceable</div>
        </div>
      </div>

      <div className="hairline mt-4 grid gap-x-6 gap-y-1 border-t pt-4 text-xs sm:grid-cols-2">
        <Row k="Band allows" v={pct(score.bandRatio)} dim={cappedByData} />
        <Row k="Data depth allows" v={pct(score.confidenceCap)} dim={!cappedByData} />
        <Row k="Confidence" v={`${score.confidence}, ${score.cycles} completed cycle(s)`} />
        <Row k="Policy" v={`${score.policyVersion} / ${score.modelVersion}`} />
      </div>

      {/*
        Said plainly, because it is the most misread number on the page. A merchant can
        look creditworthy and still be capped at a small advance, and an operator who does
        not know why will go looking for a bug.
      */}
      {cappedByData && (
        <p className="mt-3 text-xs text-ink2">
          Capped by data depth, not by the score. {score.cycles} completed cycle(s) is not
          yet enough history to lend against the band.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide the detail" : "Why this score"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              setScore(await saveScore(client.clientId, merchantId));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Recording..." : "Record this score"}
        </button>
        <span className="text-xs text-muted">
          computed {new Date(score.computedAt).toLocaleString("fr-FR")}
        </span>
      </div>

      {open && <Detail score={score} />}
    </div>
  );
}

function Detail({ score }: { score: TransferScore }) {
  return (
    <div className="hairline mt-4 border-t pt-4">
      <div className="space-y-3">
        {score.dimensions.map((d) => (
          <div key={d.key}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className={d.coverage === 0 ? "text-ink3" : ""}>
                {DIMENSION_LABEL[d.key] ?? d.key}
              </span>
              <span className="num font-mono text-xs text-muted">
                {/*
                  A dimension with no data shows as "not measured" rather than as zero.
                  Zero would read as a failing mark on something nobody has looked at, and
                  it is excluded from the weighting precisely so it cannot count against
                  the merchant.
                */}
                {d.coverage === 0
                  ? "not measured"
                  : `${Math.round(d.value * 1000)} at ${Math.round(d.coverage * 100)}%`}
              </span>
            </div>
            {/* A bar the width of the value, dimmed by how little is behind it. */}
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full bg-accent"
                style={{
                  width: `${Math.round(d.value * 100)}%`,
                  opacity: 0.25 + 0.75 * d.coverage,
                }}
              />
            </div>
            {d.reasons.length > 0 && (
              <div className="mt-1 text-xs text-muted">{d.reasons.join(" · ")}</div>
            )}
          </div>
        ))}
      </div>

      {score.reasonCodes.length > 0 && (
        <div className="mt-5">
          <div className="label">Reason codes</div>
          {/*
            Kept verbatim. These are what a decision is justified with after the fact, and
            rephrasing them here would put two versions of the same reason on record.
          */}
          <ul className="mt-2 space-y-1 text-xs text-ink2">
            {score.reasonCodes.map((r) => (
              <li key={r} className="font-mono">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, dim }: { k: string; v: string; dim?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${dim ? "opacity-50" : ""}`}>
      <span className="text-muted">{k}</span>
      <span className="num font-mono">{v}</span>
    </div>
  );
}
