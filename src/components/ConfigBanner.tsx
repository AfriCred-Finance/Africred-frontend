"use client";

import { isConfigured } from "@/lib/contracts";

export function ConfigBanner() {
  if (isConfigured) return null;
  return (
    <div className="card mb-6 border-ink/20 bg-white p-4 text-sm">
      <div className="font-medium">Contracts not configured</div>
      <p className="mt-1 text-muted">
        Set <code className="rounded bg-ink/5 px-1">NEXT_PUBLIC_FACTORY_ADDRESS</code>,{" "}
        <code className="rounded bg-ink/5 px-1">NEXT_PUBLIC_USDC_ADDRESS</code> and{" "}
        <code className="rounded bg-ink/5 px-1">NEXT_PUBLIC_ROUTER_ADDRESS</code> in{" "}
        <code className="rounded bg-ink/5 px-1">.env.local</code>, then restart the dev server.
      </p>
    </div>
  );
}
