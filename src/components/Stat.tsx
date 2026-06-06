export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function PhaseBadge({ phase }: { phase: string }) {
  const tone =
    phase === "Funding"
      ? "border-ink/30 text-ink"
      : phase === "Active"
        ? "border-accent/40 text-accent"
        : "border-line text-muted";
  return <span className={`tag ${tone}`}>{phase}</span>;
}
