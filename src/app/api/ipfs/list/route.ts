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

  // New uploads pin files under a "dossier" subdirectory of the wrapping CID so that
  // the original filenames are preserved. Older pins put files at the root, so fall
  // back to listing the root if the dossier subdir is empty or missing.
  const tryList = async (path: string) => {
    const r = await fetch(`https://ipfs.io/api/v0/ls?arg=${encodeURIComponent(path)}`, { method: "POST" });
    if (!r.ok) return null;
    const d = (await r.json()) as IpfsLsResponse;
    return d.Objects?.[0]?.Links ?? [];
  };

  let prefix = "dossier/";
  let links = await tryList(`${cid}/dossier`);
  if (!links || links.length === 0) {
    prefix = "";
    links = await tryList(cid);
  }
  if (!links) {
    return NextResponse.json({ error: "IPFS ls failed." }, { status: 502 });
  }

  const files = links
    .filter((l) => l.Type !== 1) // skip sub-directories
    .map((l) => ({
      name: l.Name,
      uri: `ipfs://${cid}/${prefix}${l.Name}`,
      url: `https://ipfs.io/ipfs/${cid}/${prefix}${encodeURIComponent(l.Name)}`,
    }));

  return NextResponse.json({ cid, files });
}
