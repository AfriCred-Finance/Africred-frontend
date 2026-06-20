import Image from "next/image";
import Link from "next/link";
import { EarnYieldButton } from "@/components/EarnYieldButton";

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="hairline relative overflow-hidden border-b">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mx-auto flex max-w-content flex-col gap-10 px-6 py-24 lg:flex-row lg:gap-12 lg:px-12 lg:py-32">
          <div className="min-w-0 flex-1 lg:pl-20 xl:pl-32">
            <h1 className="text-[40px] font-light leading-[1.04] tracking-[-0.022em] sm:text-[52px] lg:text-[56px] xl:text-[68px]">
              <span className="hero-line line-1 lg:whitespace-nowrap">Turning Africa&apos;s SME credit gap</span>
              <span className="hero-line line-2 lg:whitespace-nowrap">
                into <span className="hero-accent text-accent">15–20% APY vaults.</span>
              </span>
            </h1>

            <p className="hero-sub mt-7 max-w-2xl text-lg leading-relaxed text-ink2 lg:text-[19px]">
              A blockchain-powered marketplace bridging $330B in African SME funding needs with global capital.
            </p>

            <div className="hero-cta mt-10 flex flex-wrap items-center gap-3">
              <EarnYieldButton
                target="/vaults"
                className="btn-accent inline-flex h-9 items-center rounded-sm px-5 text-[13px] font-medium"
              >
                Earn yield
              </EarnYieldButton>
              <Link
                href="/borrow"
                className="btn-secondary inline-flex h-9 items-center rounded-sm px-5 text-[13px] font-medium"
              >
                Apply for a loan
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section className="hairline border-b">
        <div className="mx-auto max-w-content px-6 py-20 lg:px-12">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
            <div>
              <div className="eyebrow">// The problem</div>
              <h2 className="mt-4 text-3xl font-light tracking-[-0.015em] lg:text-5xl">
                The <span className="text-accent">$330B</span> credit gap.
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-ink2 lg:max-w-md lg:justify-self-end lg:text-base">
              African SMEs drive most of the continent&apos;s job growth — but remain locked out of formal credit. The
              alternatives are slow, opaque, and expensive.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {problems.map((p) => (
              <div key={p.title} className="problem-card p-6">
                <div className="text-accent">{p.icon}</div>
                <div className="mt-6 text-base font-medium">{p.title}</div>
                <p className="problem-body mt-2 text-sm leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>

          <div className="stats-strip mt-6 grid grid-cols-1 divide-y divide-bg/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-bg/15">
            {stats.map((s) => (
              <div key={s.label} className="relative px-6 py-10 text-center sm:py-14">
                <div className="num font-mono text-3xl tracking-tight lg:text-5xl">{s.value}</div>
                <div className="eyebrow mt-3 !text-[11px] !text-bg/60">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="hairline border-b">
        <div className="mx-auto max-w-content px-6 py-20 lg:px-12">
          <div className="flex flex-col items-center text-center">
            <Image src="/africred-logo.png" alt="" width={56} height={56} className="h-14 w-14" />
            <div className="eyebrow mt-6">// The solution</div>
            <h2 className="mt-4 text-3xl font-light tracking-[-0.015em] lg:text-4xl">
              The <span className="text-accent">AfriCred</span> solution.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink2 lg:text-base">
              On-chain credit vaults give global investors direct, transparent exposure to African SME loans —
              without the brokers, intermediaries, or opacity of traditional private credit.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {solutions.map((s) => (
              <div key={s.title} className="solution-card p-6">
                <div className="text-accent">{s.icon}</div>
                <div className="mt-5 text-base font-medium">{s.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-ink2">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners */}
      <section className="hairline border-b">
        <div className="mx-auto max-w-content px-6 py-20 lg:px-12">
          <h2 className="text-center text-3xl font-light tracking-tight lg:text-4xl">Our Partners</h2>

          <div className="hairline mt-12 grid grid-cols-2 gap-px border bg-rule sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="partner-cell-bg flex aspect-[2/1] items-center justify-center"
              />
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="hairline border-b">
        <div className="mx-auto max-w-content px-6 py-20 lg:px-12">
          <div className="eyebrow">// How it works</div>
          <h2 className="mt-4 text-3xl font-light tracking-tight lg:text-4xl">
            From off-chain origination to LP redemption.
          </h2>

          <div className="mt-12 grid gap-px overflow-hidden border bg-rule sm:grid-cols-2 lg:grid-cols-4 hairline">
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

      {/* Roles */}
      <section className="hairline border-b">
        <div className="mx-auto max-w-content px-6 py-20 lg:px-12">
          <div className="eyebrow">// Who participates</div>
          <h2 className="mt-4 text-3xl font-light tracking-tight lg:text-4xl">Three roles, one lifecycle.</h2>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {roles.map((r) => (
              <div key={r.title} className="card p-6">
                <div className="text-base font-medium text-accent">{r.title}</div>
                <p className="mt-3 text-sm leading-relaxed text-ink2">{r.body}</p>
                <Link href={r.href} className="link-accent mt-5 inline-block text-[12px]">
                  {r.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer-ish closing */}
      <section>
        <div className="mx-auto max-w-content px-6 py-16 lg:px-12">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <div className="eyebrow">// Get started</div>
              <h2 className="mt-3 text-2xl font-light tracking-tight">
                On Base Sepolia. Faucet-able USDC, real on-chain flows.
              </h2>
            </div>
            <div className="flex gap-3">
              <EarnYieldButton
                target="/vaults"
                className="btn-accent inline-flex h-9 items-center rounded-sm px-5 text-[13px] font-medium"
              >
                Browse vaults
              </EarnYieldButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
    </svg>
  );
}
function IconCoins() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" strokeLinecap="round" />
      <path d="M5 11v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5" strokeLinecap="round" />
    </svg>
  );
}
function IconHourglass() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path d="M7 3h10M7 21h10" strokeLinecap="round" />
      <path d="M7 3v3a5 5 0 0 0 10 0V3M7 21v-3a5 5 0 0 1 10 0v3" />
    </svg>
  );
}
function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" strokeLinecap="round" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" strokeLinecap="round" />
    </svg>
  );
}
function IconUpright() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path d="M4 20l5-5 4 4 7-7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 12h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8.5 12l2.5 2.5L15.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const problems = [
  {
    icon: <IconLock />,
    title: "Locked out of credit",
    body:
      "$330B of SME demand goes unfunded. Most African SMEs lack the collateral, credit history, or scale that formal lenders require — despite driving 80% of regional job growth.",
  },
  {
    icon: <IconCoins />,
    title: "Expensive when available",
    body:
      "Informal lenders charge 30%+ where they operate. Terms shift mid-loan, ledgers are opaque, and there is no shared record of repayment history.",
  },
  {
    icon: <IconHourglass />,
    title: "Slow and opaque",
    body:
      "Approval cycles can drag for months. Repayments and provenance live in off-chain spreadsheets — invisible to LPs and unverifiable to new lenders.",
  },
];

const stats = [
  { value: "$330B", label: "SME credit gap in Africa" },
  { value: "80%", label: "of African jobs created by SMEs" },
  { value: "15–20%", label: "APY for global LPs" },
];

const solutions = [
  {
    icon: <IconLink />,
    title: "Loan-backed vaults",
    body:
      "Every vault is linked 1:1 to an on-chain loan NFT. The borrower's terms, dossier, and repayment schedule are all auditable on-chain.",
  },
  {
    icon: <IconUpright />,
    title: "15–20% APY on stablecoins",
    body:
      "Yield comes from real SME repayments in USDC. No synthetic positions, no oracles — just the cash flows from the underlying loan.",
  },
  {
    icon: <IconGlobe />,
    title: "Permissionless access",
    body:
      "Any wallet can fund a vault. ERC-4626 shares trade like any token, and LayerZero OFT enables cross-chain holding.",
  },
  {
    icon: <IconCheck />,
    title: "Transparent settlement",
    body:
      "Every repayment, default, and recovery is recorded on-chain. NAV stays frozen during custody so LPs always see a fair price.",
  },
];

const steps = [
  {
    title: "Originate",
    body: "An admin mints a loan NFT with the borrower's terms, dossier, and repayment schedule, then deploys a vault linked 1:1 to that NFT.",
  },
  {
    title: "Fund",
    body: "LPs deposit USDC into the vault while funding is open and receive shares representing their position.",
  },
  {
    title: "Custody",
    body: "The admin moves the vault to custody; the allocator pulls the funds and deploys them to the SME off-chain.",
  },
  {
    title: "Settle",
    body: "Repayments flow back through `recordRepayment`. On the final payment, the admin closes the vault and LPs redeem at the new NAV.",
  },
];

const roles = [
  {
    title: "Originator",
    body: "Structures the loan, holds the loan NFT, services repayments, and decides when each lifecycle step happens.",
    cta: "Open admin",
    href: "/admin",
  },
  {
    title: "LP",
    body: "Deposits USDC into a vault during funding and redeems shares after the loan settles. NAV is frozen for the entire custody phase.",
    cta: "Browse vaults",
    href: "/vaults",
  },
  {
    title: "Borrower (SME)",
    body: "Submits a loan request describing the business, use of proceeds, and term. An originator reviews and structures a credit vault for the loan.",
    cta: "Apply for a loan",
    href: "/borrow",
  },
];
