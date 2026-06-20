"use client";

import type { ReactNode } from "react";
import { openDisclaimer } from "@/lib/disclaimer";

/**
 * Client wrapper around the openDisclaimer trigger so server-component pages
 * (page.tsx is RSC by default) can render disclaimer-gated CTAs without going
 * "use client" themselves.
 */
export function EarnYieldButton({
  className,
  children,
  target = "/vaults",
}: {
  className?: string;
  children: ReactNode;
  target?: string;
}) {
  return (
    <button type="button" onClick={() => openDisclaimer(target)} className={className}>
      {children}
    </button>
  );
}
