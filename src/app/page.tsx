import Link from "next/link";

export default function Home() {
  return (
    <div className="py-6">
      <p className="text-sm text-muted">Epoch-based credit vaults</p>
      <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight">
        Pooled stablecoin capital, deployed to SME loans in fixed epochs.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
        LPs deposit USDC during a funding window and receive vault shares. When the epoch begins, an
        allocator takes custody of the capital and originates loans off-chain, then returns principal
        and interest at settlement — at which point shares are redeemable at the updated price.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/vaults" className="btn btn-primary">
          Browse vaults
        </Link>
        <Link href="/admin" className="btn">
          Admin
        </Link>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          { t: "Funding", d: "Whitelisted LPs deposit USDC and mint shares." },
          { t: "Active", d: "Allocator custodies funds; NAV is frozen while capital is deployed." },
          { t: "Settled", d: "Principal ± P&L returns, fees taken, LPs redeem." },
        ].map((s, i) => (
          <div key={s.t} className="card p-5">
            <div className="text-xs text-muted">Step {i + 1}</div>
            <div className="mt-1 font-medium">{s.t}</div>
            <p className="mt-1 text-sm text-muted">{s.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
