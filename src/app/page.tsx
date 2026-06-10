import Link from "next/link";

export default function Home() {
  return (
    <div className="py-6">
      <h1 className="max-w-2xl text-3xl font-semibold tracking-tight">Demo MVP AfriCred Vault</h1>
      <div className="mt-8 flex gap-3">
        <Link href="/vaults" className="btn btn-primary">
          Browse vaults
        </Link>
        <Link href="/admin" className="btn">
          Admin
        </Link>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            t: "Create",
            d: "Admin (AfriCred) creates a vault through the vault factory, which receives stablecoins from users to be allocated to businesses as loans.",
          },
          {
            t: "Funding",
            d: "Users deposit USDC during the funding window and receive vault shares representing their position.",
          },
          {
            t: "Active",
            d: "When the epoch starts, the allocator takes custody of the pooled capital and originates SME loans off-chain. NAV is frozen.",
          },
          {
            t: "Settled",
            d: "The allocator returns principal + interest, fees are taken, the epoch closes, and LPs redeem at the updated price.",
          },
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
