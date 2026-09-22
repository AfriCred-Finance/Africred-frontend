"use client";

import { useEffect, useState } from "react";
import { api, documentLabel, type KybDocument } from "@/lib/merchant";

/**
 * The papers a merchant sent, for the reviewer deciding on them.
 *
 * Placed above the verdict because it is what the verdict is about. Each link opens the
 * file through a short-lived signed URL, so a link copied into a chat stops working
 * within minutes, and the hash is shown so a reviewer can later prove which exact file
 * they approved.
 */
export function ReviewDocuments({ merchantId }: { merchantId: string }) {
  const [docs, setDocs] = useState<KybDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ results: KybDocument[] }>(`me/documents?merchantId=${encodeURIComponent(merchantId)}`)
      .then((r) => setDocs(r.results))
      .catch((e) => setError((e as Error).message));
  }, [merchantId]);

  return (
    <div className="card p-5">
      <div className="font-medium">Documents</div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {!docs && !error && <p className="mt-2 text-sm text-muted">Loading...</p>}
      {docs?.length === 0 && (
        <p className="mt-2 text-sm text-muted">The merchant has not uploaded anything.</p>
      )}
      {docs && docs.length > 0 && (
        <div className="mt-3 divide-y divide-ink/10">
          {docs.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{documentLabel(d.kind)}</div>
                <div className="truncate font-mono text-xs text-muted" title={d.sha256}>
                  sha256 {d.sha256.slice(0, 16)}... · {(d.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                  {new Date(d.uploadedAt).toLocaleDateString("fr-FR")}
                </div>
              </div>
              {d.url ? (
                <a className="btn btn-secondary" href={d.url} target="_blank" rel="noopener noreferrer">
                  Open
                </a>
              ) : (
                <span className="text-xs text-muted">storage not configured</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
