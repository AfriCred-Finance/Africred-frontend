"use client";

import Link from "next/link";
import { MerchantAdmin } from "@/components/platform/MerchantAdmin";

/**
 * The settlement side of the console: merchants, deposits, supplier payments, rates.
 *
 * Its own page rather than a tab beside the credit vaults. The two products share the
 * operators and nothing else, and a tab strip suggests you might flip between them in the
 * middle of a task, which nobody does: a KYB review and a vault deployment are different
 * days of work.
 */
export default function SettlementAdminPage() {
  return (
    <div className="mx-auto max-w-content px-6 py-10 lg:px-12">
      <Link href="/admin" className="text-sm text-ink3 transition-colors hover:text-ink2">
        &larr; Admin
      </Link>
      <div className="mt-4 max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Settlement vault</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink2">
          Verify merchants, confirm the money arrived, pay suppliers.
        </p>
      </div>
      <div className="mt-8">
        <MerchantAdmin />
      </div>
    </div>
  );
}
