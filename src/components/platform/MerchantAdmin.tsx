"use client";

import { useEffect, useState } from "react";
import { SettlementAdmin } from "@/components/settlement/SettlementAdmin";
import { DepositsPanel } from "./DepositsPanel";
import { MerchantsPanel } from "./MerchantsPanel";
import { RatesPanel } from "./RatesPanel";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/merchant";
import { listDeposits, listMerchants } from "@/lib/platform";

/**
 * The merchant side of the console: verification, deposits, supplier payments, rates.
 *
 * One tab in the admin page rather than a separate area, because the same people do this
 * work and the credit-vault work, and two consoles behind two URLs means one of them is
 * the one nobody remembers to open.
 *
 * The four sections are ordered by the sequence a merchant actually moves through:
 * approved, funded, paid. Rates sit last because they are set once and then referenced,
 * not touched per merchant.
 */
type Section = "merchants" | "deposits" | "payments" | "rates";

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: "merchants", label: "Verification" },
  { key: "deposits", label: "Deposits" },
  { key: "payments", label: "Supplier payments" },
  { key: "rates", label: "Rates" },
];

export function MerchantAdmin() {
  const [section, setSection] = useState<Section>("merchants");
  // Set when a reviewer jumps from a merchant's file straight to their deposits, so the
  // deposits panel opens on the merchant they were already looking at.
  const [depositsFor, setDepositsFor] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Queues />

      <div className="card inline-flex items-stretch overflow-hidden">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            aria-pressed={section === s.key}
            className={`relative px-5 py-3 text-sm transition-colors ${
              section === s.key ? "text-ink" : "text-ink3 hover:text-ink2"
            }`}
          >
            <span className={section === s.key ? "font-medium" : ""}>{s.label}</span>
            {section === s.key && (
              <span className="absolute inset-x-3 bottom-0 h-px bg-accent" />
            )}
          </button>
        ))}
      </div>

      {section === "merchants" && (
        <MerchantsPanel
          onDeposits={(id) => {
            setDepositsFor(id);
            setSection("deposits");
          }}
        />
      )}
      {section === "deposits" && <DepositsPanel initialMerchantId={depositsFor} />}
      {section === "payments" && <SettlementAdmin />}
      {section === "rates" && <RatesPanel />}
    </div>
  );
}

interface Order {
  state: "pending_funds" | "funded" | "consumed" | "cancelled";
}

/**
 * What is waiting for someone, above the tabs.
 *
 * Queues rather than totals: how many merchants exist tells an operator nothing, how many
 * are blocked on them tells them which tab to open.
 */
function Queues() {
  const [awaitingReview, setAwaitingReview] = useState<number | null>(null);
  const [pendingDeposits, setPendingDeposits] = useState<number | null>(null);
  const [awaitingFunds, setAwaitingFunds] = useState<number | null>(null);
  const [inFlight, setInFlight] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [ms, os] = await Promise.all([
          listMerchants(),
          api<{ results: Order[] }>("orders"),
        ]);
        setAwaitingReview(
          ms.filter((m) => m.kybState === "submitted" || m.kybState === "under_review").length,
        );
        setAwaitingFunds(os.results.filter((o) => o.state === "pending_funds").length);
        setInFlight(os.results.filter((o) => o.state === "funded").length);

        // Deposits are listed per merchant, so a platform-wide count means one call each.
        // Fine at this size and honest about it: when the merchant list outgrows a page,
        // this wants a real platform-wide deposits route rather than a bigger loop.
        const perMerchant = await Promise.all(ms.map((m) => listDeposits(m.merchantId)));
        setPendingDeposits(perMerchant.flat().filter((d) => d.state === "pending").length);
      } catch {
        // A failed count is not worth an error banner over the whole tab: the panels below
        // each report their own failures, and those are the ones with something to fix.
      }
    })();
  }, []);

  const show = (n: number | null) => (n === null ? "..." : n);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="KYB awaiting review"
        value={show(awaitingReview)}
        sub="merchants blocked on us"
      />
      <Stat
        label="Deposits to attest"
        value={show(pendingDeposits)}
        sub="recorded, not yet signed"
      />
      <Stat
        label="Payments awaiting funds"
        value={show(awaitingFunds)}
        sub="client has not paid"
      />
      <Stat label="Payments in flight" value={show(inFlight)} sub="funded, not settled" />
    </div>
  );
}
