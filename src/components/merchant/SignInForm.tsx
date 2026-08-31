"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { session } from "@/lib/merchant";

interface Props {
  /** Focused on mount inside the dialog, where the field is the reason the box opened. */
  autoFocus?: boolean;
  /** Lets the dialog close itself once the session exists. */
  onSuccess?: () => void;
  /**
   * In the dialog the two forms swap in place. Absent on the page, where the footer stays
   * an ordinary link to /merchant/signup.
   */
  onSwitchToSignup?: () => void;
  /**
   * Off for the admin door: platform accounts are provisioned, never self-served, so
   * offering "create one" there would send staff into the merchant signup form.
   */
  allowSignup?: boolean;
}

/**
 * The sign-in form itself, with no shell around it.
 *
 * Extracted so the /merchant/login page and the dialog on the landing page run the same
 * code. Two copies would drift, and the one that drifts is the one nobody signs in with
 * while developing.
 */
export function SignInForm({
  autoFocus = false,
  onSuccess,
  onSwitchToSignup,
  allowSignup = true,
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { principal } = await session("login", { email, password });
      onSuccess?.();
      // Platform staff have no merchant of their own, so the merchant dashboard would
      // greet them with an empty account and a "name the merchant" error. Sent to their
      // own console instead, from the one place that knows which they are.
      const home =
        principal.role === "platform_admin" ? "/admin" : "/merchant/dashboard";
      // The session is a cookie the page cannot read, so a full navigation is what makes
      // the server-side guard pick it up.
      router.replace(home);
      router.refresh();
    } catch (err) {
      // The API says the same thing for a wrong password and an unknown account, on
      // purpose. Repeating its wording keeps that property instead of leaking which it was.
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="label">Email</span>
          <input
            className="input mt-1 w-full"
            type="email"
            autoComplete="email"
            autoFocus={autoFocus}
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <div className="text-sm text-red-700">{error}</div>}

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {/*
        Google sign-in is wired end to end in the API but still needs its browser flow and
        client credentials. Showing a button that cannot work would be worse than leaving
        it out, so it appears once the flow exists.
      */}

      {allowSignup && (
      <p className="mt-6 text-sm text-ink2">
        No account yet?{" "}
        {onSwitchToSignup ? (
          <button type="button" className="underline" onClick={onSwitchToSignup}>
            Create one
          </button>
        ) : (
          <Link href="/merchant/signup" className="underline">
            Create one
          </Link>
        )}
      </p>
      )}
    </>
  );
}
