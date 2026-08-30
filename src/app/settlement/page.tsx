"use client";

import { useState } from "react";
import { SettlementView } from "@/components/settlement/SettlementView";

/**
 * One settlement vault page, two deposit gates.
 *
 * Open and whitelisted are the same product: the same contract, the same accounting, the
 * same payouts. What differs is who may deposit. Listing them as two products in the menu
 * asked a visitor to choose a side before they knew what either was, so the choice moved
 * here, where the difference can actually be explained.
 */
type Variant = "open" | "whitelisted";

const TABS: Array<{ key: Variant; label: string; detail: string }> = [
  {
    key: "open",
    label: "Open",
    detail: "Anyone can deposit.",
  },
  {
    key: "whitelisted",
    label: "Whitelisted",
    detail: "Deposits are restricted to approved addresses.",
  },
];

export default function SettlementPage() {
  const [variant, setVariant] = useState<Variant>("open");
  const active = TABS.find((t) => t.key === variant)!;

  return (
    <div>
      <div className="mx-auto max-w-content px-6 pt-10 lg:px-12">
        <div className="card inline-flex items-stretch overflow-hidden">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setVariant(t.key)}
              aria-pressed={variant === t.key}
              className={`px-5 py-3 text-sm transition-colors ${
                variant === t.key ? "text-ink" : "text-ink3 hover:text-ink2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/*
          Stated rather than left to be inferred from a label. "Whitelisted" tells a
          visitor nothing about whether they can use it.
        */}
        <p className="mt-3 text-sm text-ink2">{active.detail}</p>
      </div>

      {/*
        Keyed by variant so switching remounts rather than reusing the previous vault's
        state. Without it the figures from one contract would linger while the other loads,
        which is a balance shown against the wrong vault.
      */}
      <SettlementView key={variant} variant={variant} />
    </div>
  );
}
