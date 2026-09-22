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

interface Props {
  /** Focused on mount inside the dialog, where the field is the reason the box opened. */
  autoFocus?: boolean;
  /** Lets the dialog close itself once the session exists. */
  onSuccess?: () => void;
  /**
   * In the dialog the two forms swap in place. Absent on the page, where the footer stays
   * an ordinary link to /merchant/login.
   */
  onSwitchToSignIn?: () => void;
}

/**
 * The signup form itself, with no shell around it.
 *
 * Shared by the /merchant/signup page and the dialog on the landing page, for the same
 * reason as SignInForm: one form, shown two ways.
 */
export function SignUpForm({ autoFocus = false, onSuccess, onSwitchToSignIn }: Props) {
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
      onSuccess?.();
      // Straight to the company file, which is the only thing a new account can act on:
      // it cannot operate until reviewed, and it cannot be reviewed until it has papers.
      router.replace("/merchant/documents");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f, i) => (
            <label key={f.key} className="block">
              <span className="label">{f.label}</span>
              <input
                className="input mt-1 w-full"
                autoComplete={f.auto}
                autoFocus={autoFocus && i === 0}
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
        {onSwitchToSignIn ? (
          <button type="button" className="underline" onClick={onSwitchToSignIn}>
            Sign in
          </button>
        ) : (
          <Link href="/merchant/login" className="underline">
            Sign in
          </Link>
        )}
      </p>
    </>
  );
}
