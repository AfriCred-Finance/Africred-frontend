"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { session } from "@/lib/merchant";

export default function LoginPage() {
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
      await session("login", { email, password });
      // The session is a cookie the page cannot read, so a full navigation is what makes
      // the server-side guard pick it up.
      router.replace("/merchant/dashboard");
      router.refresh();
    } catch (err) {
      // The API says the same thing for a wrong password and an unknown account, on
      // purpose. Repeating its wording keeps that property instead of leaking which it was.
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-ink2">Manage your supplier payments.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
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

      <p className="mt-6 text-sm text-ink2">
        No account yet?{" "}
        <Link href="/merchant/signup" className="underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
