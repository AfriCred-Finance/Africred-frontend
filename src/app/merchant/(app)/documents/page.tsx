"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  DOCUMENT_KINDS,
  documentLabel,
  fileToBase64,
  kybMessage,
  type KybDocument,
  type Merchant,
} from "@/lib/merchant";

/**
 * The merchant's company file: upload the papers, then send it for review.
 *
 * This is the step a new account lands on. Before it existed the dashboard told a new
 * merchant to "upload your company documents, then submit your file for review" and gave
 * them no way to do either, so nobody who signed up could ever be approved.
 *
 * The file is editable only while it is the merchant's: in draft, or after a rejection.
 * Once submitted, what the reviewer is looking at must not change underneath them.
 */
const MAX_MB = 10;
const ACCEPT = "application/pdf,image/png,image/jpeg";

export default function DocumentsPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [docs, setDocs] = useState<KybDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([
        api<Merchant>("me/merchant"),
        api<{ results: KybDocument[] }>("me/documents"),
      ]);
      setMerchant(m);
      setDocs(d.results);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!merchant) {
    return error ? (
      <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>
    ) : (
      <div className="card p-6 text-sm text-muted">Loading...</div>
    );
  }

  const editable = merchant.kybState === "draft" || merchant.kybState === "rejected";
  const kyb = kybMessage(merchant.kybState, merchant.kybRejectionReason);
  const missing = DOCUMENT_KINDS.filter((k) => k.expected && !docs.some((d) => d.kind === k.key));

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api("me/kyb/submit", { method: "POST" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Company documents</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink2">
          We verify your company before you can pay suppliers. Upload the papers below, then
          send your file for review. PDF, PNG or JPEG, up to {MAX_MB} MB each.
        </p>
      </div>

      <div
        className={`card p-5 ${
          kyb.tone === "bad" ? "border-red-500/30" : kyb.tone === "ok" ? "border-accent/40" : ""
        }`}
      >
        <div className={`font-medium ${kyb.tone === "bad" ? "text-red-700" : ""}`}>{kyb.title}</div>
        <p className="mt-1 text-sm text-ink2">{kyb.detail}</p>
      </div>

      {error && <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>}

      {editable && <UploadForm onDone={load} onError={setError} />}

      <div>
        <h2 className="mb-3 font-medium">On file</h2>
        <div className="card divide-y divide-ink/10">
          {docs.length === 0 && (
            <div className="p-6 text-sm text-muted">Nothing uploaded yet.</div>
          )}
          {docs.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              editable={editable}
              onRemoved={load}
              onError={setError}
            />
          ))}
        </div>
      </div>

      {editable && (
        <div className="card space-y-3 p-5">
          <div className="font-medium">Send for review</div>
          {/*
            Guidance rather than a gate. What a complete file looks like depends on the
            country and the company's legal form, and a reviewer decides that; the API only
            insists on one document.
          */}
          {missing.length > 0 && (
            <p className="text-sm text-ink2">
              Reviewers usually also need: {missing.map((k) => k.label).join(", ")}. Files sent
              without them tend to come back.
            </p>
          )}
          <p className="text-sm text-ink2">
            Once sent, your documents are locked until the review is done.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || docs.length === 0}
            onClick={submit}
          >
            {submitting ? "Sending..." : "Send my file for review"}
          </button>
        </div>
      )}
    </div>
  );
}

function UploadForm({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (message: string | null) => void;
}) {
  const [kind, setKind] = useState(DOCUMENT_KINDS[0]!.key);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  // Re-keyed after each upload so the file input clears; its value cannot be set directly.
  const [inputKey, setInputKey] = useState(0);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    // Checked here as well as by the API, so a 40 MB scan is refused before it is read
    // into memory and sent, not after.
    if (file.size > MAX_MB * 1024 * 1024) {
      onError(`${file.name} is ${Math.ceil(file.size / 1_048_576)} MB; the limit is ${MAX_MB} MB.`);
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await api("me/documents", {
        method: "POST",
        body: JSON.stringify({
          kind,
          contentType: file.type,
          dataBase64: await fileToBase64(file),
        }),
      });
      setFile(null);
      setInputKey((k) => k + 1);
      onDone();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="card space-y-4 p-5">
      <div className="font-medium">Add a document</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Document</span>
          <select className="input mt-1 w-full" value={kind} onChange={(e) => setKind(e.target.value)}>
            {DOCUMENT_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">File</span>
          <input
            key={inputKey}
            className="input mt-1 w-full"
            type="file"
            accept={ACCEPT}
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <button type="submit" className="btn btn-secondary" disabled={busy || !file}>
        {busy ? "Uploading..." : "Upload"}
      </button>
    </form>
  );
}

function DocumentRow({
  doc,
  editable,
  onRemoved,
  onError,
}: {
  doc: KybDocument;
  editable: boolean;
  onRemoved: () => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="font-medium">{documentLabel(doc.kind)}</div>
        <div className="truncate text-xs text-muted">
          {(doc.sizeBytes / 1024).toFixed(0)} KB · uploaded{" "}
          {new Date(doc.uploadedAt).toLocaleDateString("fr-FR")}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {doc.url && (
          <a className="btn btn-ghost" href={doc.url} target="_blank" rel="noopener noreferrer">
            View
          </a>
        )}
        {editable && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              onError(null);
              try {
                await api(`me/documents/${doc.id}/remove`, { method: "POST" });
                onRemoved();
              } catch (e) {
                onError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Removing..." : "Remove"}
          </button>
        )}
      </div>
    </div>
  );
}
