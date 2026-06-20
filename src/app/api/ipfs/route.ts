import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Pins uploaded files to IPFS via Pinata and returns the resulting CID.
 * Requires PINATA_JWT in the server environment (.env.local). The JWT never
 * reaches the browser — the client uploads here, we pin, and return ipfs://CID.
 */
export async function POST(req: NextRequest) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      { error: "IPFS not configured — set PINATA_JWT in .env.local and restart the dev server." },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided." }, { status: 400 });
  }

  const out = new FormData();
  // Pinata's wrapWithDirectory only preserves the original filename when the multipart
  // filename header is a path that includes a parent directory. Without the "dossier/"
  // prefix, Pinata replaces the name with an internal hash. The list route looks inside
  // this same "dossier" subdirectory.
  for (const f of files) {
    const safeName = f.name.replace(/[\\/]+/g, "_");
    out.append("file", f, `dossier/${safeName}`);
  }
  out.append("pinataOptions", JSON.stringify({ wrapWithDirectory: true }));
  out.append("pinataMetadata", JSON.stringify({ name: "africred-dossier" }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: out,
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Pinata error: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const data = (await res.json()) as { IpfsHash: string };
  return NextResponse.json({ cid: data.IpfsHash, uri: `ipfs://${data.IpfsHash}` });
}
