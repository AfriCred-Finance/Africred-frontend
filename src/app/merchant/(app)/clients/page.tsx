"use client";

import { useEffect, useState } from "react";
import { api, type Client } from "@/lib/merchant";

/**
 * The merchant's own customers.
 *
 * No merchant id is sent: the API takes the tenant from the session, so this list can only
 * ever be theirs.
 */
export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", addressLine: "", phone: "", externalRef: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function load() {
    try {
      setClients((await api<{ results: Client[] }>("me/clients")).results);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Generated here rather than typed: an id is bookkeeping, not something to ask a
      // merchant to invent while they have a customer in front of them.
      await api("me/clients", {
        method: "POST",
        body: JSON.stringify({ ...form, clientId: `cli_${crypto.randomUUID()}` }),
      });
      setForm({ name: "", addressLine: "", phone: "", externalRef: "" });
      setAdding(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <button type="button" className="btn btn-primary" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "Add a client"}
        </button>
      </div>

      {adding && (
        <form onSubmit={submit} className="card space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Name</span>
              <input className="input mt-1 w-full" required value={form.name} onChange={set("name")} />
            </label>
            <label className="block">
              <span className="label">Phone</span>
              <input className="input mt-1 w-full" value={form.phone} onChange={set("phone")} />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Address</span>
              <input className="input mt-1 w-full" value={form.addressLine} onChange={set("addressLine")} />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Your reference</span>
              <input className="input mt-1 w-full" value={form.externalRef} onChange={set("externalRef")} />
              <span className="mt-1 block text-xs text-muted">Optional, for your own records.</span>
            </label>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Adding..." : "Add client"}
          </button>
        </form>
      )}

      {error && !adding && <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>}

      <div className="card divide-y divide-ink/10">
        {clients.length === 0 && <div className="p-6 text-sm text-muted">No clients yet.</div>}
        {clients.map((c) => (
          <div key={c.clientId} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="truncate font-medium">{c.name}</div>
              <div className="truncate text-xs text-muted">
                {[c.phone, c.addressLine, c.externalRef].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            {!c.active && <span className="text-xs text-ink3">Inactive</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
