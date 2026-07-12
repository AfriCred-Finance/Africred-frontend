"use client";

import { useChainAddresses } from "@/lib/contracts";

export function ConfigBanner() {
  const { chainName, factory, usdc } = useChainAddresses();
  if (factory && usdc) return null;
  return (
    <div className="card mb-6 border-ink/20 bg-white p-4 text-sm">
      <div className="font-medium">Contracts not deployed on {chainName}</div>
      <p className="mt-1 text-muted">
        Set the relevant address env vars in Vercel and redeploy, or switch to another chain from the wallet.
      </p>
    </div>
  );
}
