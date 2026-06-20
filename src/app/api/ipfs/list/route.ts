import { NextRequest, NextResponse } from "next/server";
import { ipfsCid } from "@/lib/ipfs";

export const runtime = "nodejs";

type IpfsLsLink = { Name: string; Size: number; Type: number };
type IpfsLsResponse = { Objects?: { Links?: IpfsLsLink[] }[] };

/** List files in an IPFS directory (proxied to avoid browser CORS). */
export async function GET(req: NextRequest) {
  const uri = req.nextUrl.searchParams.get("uri");
  if (!uri) return NextResponse.json({ error: "Missing uri parameter." }, { status: 400 });

  const cid = ipfsCid(uri);
  if (!cid) return NextResponse.json({ error: "Invalid ipfs:// URI." }, { status: 400 });

  const res = await fetch(`https://ipfs.io/api/v0/ls?arg=${encodeURIComponent(cid)}`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `IPFS ls failed: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const data = (await res.json()) as IpfsLsResponse;
  const links = data.Objects?.[0]?.Links ?? [];
  const files = links
    .filter((l) => l.Type !== 1) // skip sub-directories
    .map((l) => ({
      name: l.Name,
      uri: `ipfs://${cid}/${l.Name}`,
      url: `https://ipfs.io/ipfs/${cid}/${encodeURIComponent(l.Name)}`,
    }));

  return NextResponse.json({ cid, files });
}
