import type { Metadata } from "next";
import Link from "next/link";
import { CreateAccountButton, SignInButton } from "@/components/merchant/AuthDialog";

/**
 * Public marketing landing for the merchant product ("AfriCred Business").
 *
 * This file sits at the /merchant segment root, outside the (app) and (auth) route
 * groups, so it inherits only the RootLayout. The global Nav hides itself on /merchant
 * paths, which is why this page carries its own lightweight header and footer: no wallet,
 * no chain, none of the LP-facing vocabulary. The only two doors it offers are the ones a
 * merchant actually needs, sign in and create an account.
 *
 * Once the merchant.<domain> subdomain is wired (a host rewrite to /merchant), this is the
 * page that answers merchant.<domain>/.
 */

export const metadata: Metadata = {
  title: "AfriCred Business — Pay your suppliers abroad",
  description:
    "Fund a local deposit, get a transparent quote, and let AfriCred settle your cross-border supplier payments on-chain.",
};

export default function MerchantLanding() {
  return (
    <div className="min-h-screen">
      {/* Header — self-contained; the global Nav is hidden on /merchant */}
      <header className="hairline sticky top-0 z-30 border-b bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-content items-center gap-6 px-6 lg:px-12">
          <Link href="/merchant" className="font-semibold tracking-tight text-ink">
            AfriCred <span className="text-ink3">Business</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <SignInButton className="btn-secondary inline-flex h-9 items-center rounded-sm px-4 text-[13px] font-medium">
              Sign in
            </SignInButton>
            <CreateAccountButton className="btn-accent inline-flex h-9 items-center rounded-sm px-4 text-[13px] font-medium">
              Create account
            </CreateAccountButton>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hairline relative overflow-hidden border-b">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mx-auto max-w-content px-6 py-24 lg:px-12 lg:py-32">
          <div className="max-w-3xl">
            <div className="eyebrow">// For African businesses</div>
            <h1 className="mt-5 text-[38px] font-light leading-[1.06] tracking-[-0.022em] sm:text-[48px] lg:text-[60px]">
              Pay your suppliers abroad,
              <br />
              <span className="text-accent">without the bank runaround.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ink2 lg:text-[19px]">
              Fund a deposit in your local currency, see one transparent quote, and AfriCred
              settles the payment to your supplier on-chain. No opaque spreads, no
              multi-day limbo, no crypto to learn.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <CreateAccountButton className="btn-accent inline-flex h-10 items-center rounded-sm px-6 text-[13px] font-medium">
                Create your account
              </CreateAccountButton>
              <SignInButton className="btn-secondary inline-flex h-10 items-center rounded-sm px-6 text-[13px] font-medium">
                Sign in
              </SignInButton>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="hairline border-b bg-accent2">
        <div className="mx-auto grid max-w-content grid-cols-1 divide-y divide-bg/15 px-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {stats.map((s) => (
            <div key={s.label} className="px-6 py-10 text-center sm:py-12">
              <div className="num font-mono text-3xl tracking-tight text-bg lg:text-4xl">{s.value}</div>
              <div className="eyebrow mt-3 !text-[11px] !text-bg/60">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="hairline border-b">
        <div className="mx-auto max-w-content px-6 py-20 lg:px-12">
          <div className="eyebrow">// What you get</div>
          <h2 className="mt-4 text-3xl font-light tracking-[-0.015em] lg:text-4xl">
            Everything to move money, nothing to configure.
          </h2>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="card p-6">
                <div className="text-accent">{f.icon}</div>
                <div className="mt-5 text-base font-medium">{f.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-ink2">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="hairline border-b">
        <div className="mx-auto max-w-content px-6 py-20 lg:px-12">
          <div className="eyebrow">// How it works</div>
          <h2 className="mt-4 text-3xl font-light tracking-tight lg:text-4xl">
            From deposit to settled supplier.
          </h2>

          <div className="hairline mt-12 grid gap-px overflow-hidden border bg-rule sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((s, i) => (
              <div key={s.title} className="bg-bg p-6">
                <div className="eyebrow !text-[10px]">Step {String(i + 1).padStart(2, "0")}</div>
                <div className="mt-3 text-base font-medium">{s.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-ink2">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="hairline border-b">
        <div className="mx-auto max-w-content px-6 py-16 lg:px-12">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <div className="eyebrow">// Get started</div>
              <h2 className="mt-3 max-w-xl text-2xl font-light tracking-tight lg:text-3xl">
                Open your account today. Verification takes minutes.
              </h2>
            </div>
            <div className="flex gap-3">
              <CreateAccountButton className="btn-accent inline-flex h-10 items-center rounded-sm px-6 text-[13px] font-medium">
                Create account
              </CreateAccountButton>
              <SignInButton className="btn-secondary inline-flex h-10 items-center rounded-sm px-6 text-[13px] font-medium">
                Sign in
              </SignInButton>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="mx-auto flex max-w-content flex-col items-start justify-between gap-4 px-6 py-10 text-sm text-ink3 sm:flex-row sm:items-center lg:px-12">
          <div>
            AfriCred <span className="text-ink3">Business</span>
          </div>
          <div className="flex items-center gap-5">
            <SignInButton className="transition-colors hover:text-ink2">
              Sign in
            </SignInButton>
            <CreateAccountButton className="transition-colors hover:text-ink2">
              Create account
            </CreateAccountButton>
            <span className="text-ink3/70">© {new Date().getFullYear()} AfriCred</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const stats = [
  { value: "Minutes", label: "To open an account" },
  { value: "One quote", label: "FX, fees and tax, upfront" },
  { value: "On-chain", label: "Every settlement, auditable" },
];

const features = [
  {
    icon: <IconGlobe />,
    title: "Cross-border payments",
    body:
      "Pay a supplier abroad by name. You fund locally, they receive in their currency. AfriCred handles the rails end to end.",
  },
  {
    icon: <IconReceipt />,
    title: "One transparent quote",
    body:
      "Before you commit, see the base amount, FX commission, transfer fee and tax broken out. No hidden spread on the rate.",
  },
  {
    icon: <IconBolt />,
    title: "Fast settlement",
    body:
      "Once your deposit is confirmed, the payout is drawn and settled on-chain. You get the transaction hash, not a promise.",
  },
  {
    icon: <IconCash />,
    title: "Cash or bank transfer",
    body:
      "Top up your balance the way you already work: pay cash against a receipt number, or wire a bank transfer with a reference.",
  },
  {
    icon: <IconUsers />,
    title: "Your clients and suppliers",
    body:
      "Keep a clean address book. Reuse a supplier in one click on the next payment instead of re-entering their details.",
  },
  {
    icon: <IconShield />,
    title: "Verified onboarding (KYB)",
    body:
      "A guided business verification unlocks payments once approved. Your legal, contact and banking details stay in one place.",
  },
];

const steps = [
  {
    title: "Sign up",
    body: "Create your business account and complete a short KYB. Approval takes minutes, not weeks.",
  },
  {
    title: "Add a client",
    body: "Save the client and the supplier you are paying on their behalf, once, then reuse them.",
  },
  {
    title: "Get a quote",
    body: "Enter the amount and currency. See FX, fees and tax broken out before you commit.",
  },
  {
    title: "Fund it",
    body: "Top up by cash against a receipt, or by bank transfer with a reference. Balance updates on confirmation.",
  },
  {
    title: "We settle",
    body: "AfriCred draws the payout and settles on-chain. Track its state and transaction hash from your dashboard.",
  },
];

/* Icons — inline SVG, stroke 1.5, matching the LP landing set. */
function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
    </svg>
  );
}
function IconReceipt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21V3z" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" strokeLinecap="round" />
    </svg>
  );
}
function IconBolt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" strokeLinejoin="round" />
    </svg>
  );
}
function IconCash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v6M18 9v6" strokeLinecap="round" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 20a5.5 5.5 0 0 0-2.5-4.6" strokeLinecap="round" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
