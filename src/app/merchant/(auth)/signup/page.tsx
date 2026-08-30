"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { session } from "@/lib/merchant";

/**
 * Company details collected at signup.
 *
 * These are the fields the KYB review actually needs. Asking for them now rather than
 * later means a reviewer has something to look at as soon as documents arrive, instead of
 * a half-empty record that has to be chased.
 */
const FIELDS = [
  { key: "legalName", label: "Company name", auto: "organization" },
  { key: "contactFirstName", label: "First name", auto: "given-name" },
  { key: "contactLastName", label: "Last name", auto: "family-name" },
  { key: "phone", label: "Phone", auto: "tel" },
  { key: "addressLine", label: "Address", auto: "street-address" },
  { key: "city", label: "City", auto: "address-level2" },
  { key: "countryIso", label: "Country code", auto: "country" },
  { key: "bankAccount", label: "Bank account", auto: "off" },
] as const;

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({ countryIso: "ML" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await session("signup", { ...form, email, password });
      router.replace("/merchant/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-ink2">
        We verify your company before you can send payments. It takes a few hours.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="label">{f.label}</span>
              <input
                className="input mt-1 w-full"
                autoComplete={f.auto}
                required
                value={form[f.key] ?? ""}
                onChange={set(f.key)}
              />
            </label>
          ))}
        </div>

        <label className="block">
          <span className="label">Email</span>
          <input
            className="input mt-1 w-full"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="label">Password</span>
          <input
            className="input mt-1 w-full"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {/* Stated up front rather than as a rejection after the form is filled in. */}
          <span className="mt-1 block text-xs text-muted">At least 12 characters.</span>
        </label>

        {error && <div className="text-sm text-red-700">{error}</div>}

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Creating..." : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink2">
        Already have an account?{" "}
        <Link href="/merchant/login" className="underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
