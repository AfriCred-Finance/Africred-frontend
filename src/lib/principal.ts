import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./session";

/**
 * Who the session says you are, resolved on the server.
 *
 * Server-only: it reads an httpOnly cookie and calls the API with the token, neither of
 * which the browser can do. Every guarded layout uses this one copy, because three
 * hand-written copies of the same fetch is three chances for one of them to trust a
 * response it should not.
 */
export interface ServerPrincipal {
  email: string;
  role: "platform_admin" | "merchant_user";
  merchantId: string | null;
}

const API = process.env.SETTLEMENT_API_URL ?? "http://127.0.0.1:8787";

export async function currentPrincipal(): Promise<ServerPrincipal | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const res = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res?.ok) return null;
  return (await res.json()) as ServerPrincipal;
}
