/**
 * Proxy to the settlement API.
 *
 * The browser never reaches that service directly. It holds the owner and allocator keys,
 * so exposing it to a page would put the ability to move client money one CORS rule away
 * from anyone who opens the site. Everything goes through here, server-side.
 *
 * Nothing is interpreted on the way through. Validation belongs to the service, which
 * already refuses what it should; re-checking here would produce a second set of rules
 * free to drift from the first.
 */
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

const API = process.env.SETTLEMENT_API_URL ?? "http://127.0.0.1:8787";

/** Payments involve a chain call and a provider round trip; the default fetch timeout is short. */
const TIMEOUT_MS = 120_000;

async function forward(req: NextRequest, path: string[]) {
  const target = `${API}/${path.join("/")}${req.nextUrl.search}`;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  // The session lives in an httpOnly cookie and becomes a bearer token only here, on the
  // server. The page never holds it, so a script injected into it has nothing to steal.
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    // Everything this service answers is JSON except a document, and a document read as
    // text is a corrupted document: PDFs are binary. So the body passes through as bytes
    // and keeps the headers that say how to show it.
    const type = res.headers.get("Content-Type") ?? "application/json";
    if (!type.startsWith("application/json")) {
      const headers: Record<string, string> = { "Content-Type": type };
      for (const h of ["Content-Disposition", "Cache-Control", "X-Content-Type-Options"]) {
        const v = res.headers.get(h);
        if (v) headers[h] = v;
      }
      return new NextResponse(await res.arrayBuffer(), { status: res.status, headers });
    }
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    // Told apart on purpose: "the service is not running" and "the payment is taking too
    // long" need opposite reactions from whoever is watching the screen.
    const aborted = (e as Error).name === "AbortError";
    return NextResponse.json(
      {
        error: aborted
          ? `the settlement service did not answer within ${TIMEOUT_MS / 1000}s`
          : `cannot reach the settlement service at ${API}: ${(e as Error).message}`,
      },
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
