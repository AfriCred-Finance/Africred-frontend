/**
 * Sign-in and sign-out for the merchant area.
 *
 * The token never reaches JavaScript. It is set as an httpOnly cookie here and attached by
 * the settlement proxy on the server side, so a script injected into the page cannot read
 * it, and neither can an extension. Storing it in localStorage would put a working session
 * one XSS away from anyone.
 *
 * This route exists precisely because the browser must not hold the token: the sign-in
 * response from the API carries one, and it stops here.
 */
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

const API = process.env.SETTLEMENT_API_URL ?? "http://127.0.0.1:8787";

/** Sign in, or sign up and sign in, depending on `action`. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>;
  const action = body.action === "signup" ? "signup" : "login";
  delete body.action;

  const upstream = await fetch(`${API}/auth/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ error: "the settlement service is unreachable" }, { status: 502 });
  }

  const data = (await upstream.json()) as { token?: string; error?: string };
  if (!upstream.ok || !data.token) {
    // The API's own wording is more useful than anything invented here.
    return NextResponse.json({ error: data.error ?? "sign-in failed" }, { status: upstream.status });
  }

  // Everything except the token: the client needs to know who it is, never how to prove it.
  const { token, ...safe } = data as Record<string, unknown> & { token: string };
  const res = NextResponse.json(safe);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

/** Sign out: revoke upstream, then drop the cookie whatever the API answered. */
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    await fetch(`${API}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ token }),
      cache: "no-store",
    }).catch(() => null);
  }

  // Cleared even if the revocation call failed. Leaving the cookie in place because the
  // service was briefly down would keep someone signed in who asked to leave.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
