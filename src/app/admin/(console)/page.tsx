import Link from "next/link";
import { currentPrincipal } from "@/lib/principal";
import { SignOutButton } from "@/components/platform/SignOutButton";

/**
 * The admin landing: who you are, and the two consoles you can open.
 *
 * Deliberately short. It exists to route an operator, not to brief them, and anything
 * shown here would be a figure they have to re-read on the page that actually owns it.
 * The two products underneath share staff and nothing else, so the choice is made once,
 * on arrival, rather than by a tab strip carried through every screen.
 *
 * A server component: the guard in layout.tsx has already resolved the session, so
 * greeting the operator by name costs nothing and confirms which account is signed in
 * before they start approving things.
 */
export default async function AdminHome() {
  const principal = await currentPrincipal();

  return (
    <div className="mx-auto max-w-content px-6 py-16 lg:px-12 lg:py-24">
      <div className="max-w-2xl">
        <div className="eyebrow">// Internal</div>
        <h1 className="mt-5 text-[34px] font-light leading-[1.1] tracking-[-0.02em] sm:text-[42px]">
          Admin console
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-ink2">
          Two products, one door. Credit vaults raise and repay LP capital; the settlement
          vault moves merchant money to suppliers abroad.
        </p>
        {principal && (
          <p className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink3">
            <span>Signed in as {principal.email}.</span>
            <SignOutButton />
          </p>
        )}
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <Door
          href="/admin/credit"
          title="Credit vaults"
          body="Configure a vault, set the loan terms, deploy it, then run its lifecycle: custody, repayments, defaults."
          points={["Create loan", "Manage loan"]}
          note="Needs a connected wallet: every action is a transaction."
        />
        <Door
          href="/admin/settlement"
          title="Settlement vault"
          body="Verify merchants, record and attest their deposits, pay their suppliers, publish the rates their quotes are priced from."
          points={["Verification", "Deposits", "Supplier payments", "Rates"]}
          note="Needs a wallet only to sign a deposit attestation."
        />
      </div>
    </div>
  );
}

function Door({
  href,
  title,
  body,
  points,
  note,
}: {
  href: string;
  title: string;
  body: string;
  points: string[];
  note: string;
}) {
  return (
    <Link href={href} className="card group block p-6 transition-colors hover:bg-ink/5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-lg font-medium">{title}</div>
        <span className="text-ink3 transition-transform group-hover:translate-x-0.5">&rarr;</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink2">{body}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {points.map((p) => (
          <span key={p} className="tag border-line text-muted">
            {p}
          </span>
        ))}
      </div>
      {/*
        Said here rather than discovered at the first click. The two consoles need the
        wallet to very different degrees, and an operator who connects out of habit before
        a KYB review is doing it for nothing.
      */}
      <p className="mt-4 text-xs text-muted">{note}</p>
    </Link>
  );
}
