import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Receives a borrower's loan request (form fields) and pins it as JSON to IPFS
 * via Pinata so the originator has a tamper-evident record off-chain. Returns
 * the resulting `ipfs://CID` reference. Real persistence (DB, email-to-admin)
 * is a TODO — this endpoint just gives the form a stable target today.
 *
 * Requires PINATA_JWT in the server environment (.env.local).
 */
export async function POST(req: NextRequest) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      { error: "Server not configured — set PINATA_JWT in .env.local and restart the dev server." },
      { status: 500 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const required = ["businessName", "country", "amount", "purpose", "termDays", "contactName", "contactEmail"];
  const missing = required.filter((k) => !payload[k] || String(payload[k]).trim().length === 0);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 });
  }

  const record = {
    submittedAt: new Date().toISOString(),
    ...payload,
  };

  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataMetadata: { name: `africred-loan-request-${Date.now()}` },
      pinataContent: record,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Pinata error: ${text}` }, { status: 502 });
  }

  const data = (await res.json()) as { IpfsHash?: string };
  if (!data.IpfsHash) {
    return NextResponse.json({ error: "Pinata returned no IpfsHash." }, { status: 502 });
  }

  // Server-side log so the originator can see new submissions in the dev console.
  console.log("[loan-request]", { cid: data.IpfsHash, businessName: payload.businessName, country: payload.country });

  return NextResponse.json({ uri: `ipfs://${data.IpfsHash}`, cid: data.IpfsHash });
}
