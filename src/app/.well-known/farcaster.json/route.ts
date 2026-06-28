import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const manifest = {
    accountAssociation: {
      header: process.env.FARCASTER_ACCOUNT_HEADER ?? "",
      payload: process.env.FARCASTER_ACCOUNT_PAYLOAD ?? "",
      signature: process.env.FARCASTER_ACCOUNT_SIGNATURE ?? "",
    },
    miniapp: {
      version: "1",
      name: "AfriCred",
      iconUrl: `${appUrl}/africred-logo.png`,
      homeUrl: `${appUrl}/vaults`,
      splashImageUrl: `${appUrl}/africred-logo.png`,
      splashBackgroundColor: "#F5F1E8",
      subtitle: "On-chain SME credit",
      description: "Bridging Africa's $330B SME credit gap on-chain.",
      primaryCategory: "finance",
      tags: ["defi", "yield", "africa", "credit"],
    },
  };

  return NextResponse.json(manifest);
}
