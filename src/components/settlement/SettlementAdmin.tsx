"use client";

/**
 * Settlement operations: record a client order, attest the funds arrived, pay the supplier.
 *
 * The one thing worth understanding before reading further is who signs what. The admin
 * signs a MESSAGE in their wallet, costing nothing and touching no chain, which attests
 * that the client's transfer landed. The backend separately signs the TRANSACTION that
 * moves the money. The vault verifies both, so neither party can pay a supplier alone.
 *
 * That is why the approve step here opens a wallet but produces no transaction, and why
 * the execute step produces a transaction without opening a wallet.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { Stat } from "@/components/Stat";

// --------------------------------------------------------------------------- types

interface Order {
  orderId: string;
  clientName: string;
  clientReference: string | null;
  supplierName: string;
  supplierAccountId: number | null;
  /** What the merchant recorded about the beneficiary. Null on orders created before it was kept. */
  supplierBankAccount: string | null;
  supplierBankName: string | null;
  supplierSwift: string | null;
  destinationCountryIso: string | null;
  toAmount: string;
  toCurrency: string;
  fiatCurrency: string;
  fiatExpected: string;
  fiatReceived: string | null;
  bankReference: string | null;
  approver: string | null;
  maxAmount: string | null;
  deadline: number | null;
  fundedAt: string | null;
  state: "pending_funds" | "funded" | "consumed" | "cancelled";
  createdAt: string;
  payout?: Payout | null;
}

interface PayoutProviderOption {
  id: string;
  label: string;
  available: boolean;
  /** Why it cannot be used, when it cannot. Shown as-is: it names what is missing. */
  reason: string | null;
  /** Null until a corridor is named. */
  supportsRoute: boolean | null;
  /** Where this provider wants the deposit. Null when it cannot say. */
  settlementChainId: number | null;
  /** True when choosing this provider means the capital has to cross a chain. */
  needsBridge: boolean;
}

/**
 * A path capital can take off the vault's chain.
 *
 * Offered as a choice rather than resolved silently, because two routes to the same chain can
 * differ by a week of latency and by whether a third party holds the funds on the way. That is
 * not a detail to decide on an operator's behalf.
 */
interface BridgeRouteOption {
  id: string;
  label: string;
  available: boolean;
  reason: string | null;
  fromChainId: number;
  intermediateChainId: number | null;
  toChainId: number;
  entryAddress: string;
  /** In words. The single fact that decides whether this corridor is a product. */
  expectedDuration: string;
  /** True when the route draws and bridges in one transaction, so nothing can be stranded. */
  atomic?: boolean;
}

/**
 * What a route will carry right now.
 *
 * `max` is null when the route has no ceiling, which is the canonical bridge: it carries any amount
 * and takes a week about it. A liquidity route always has one, and it moves, because it is
 * somebody's inventory rather than a protocol constant.
 */
interface BridgeCapacity {
  routeId: string;
  ok: boolean;
  max: string | null;
  reason: string | null;
}

interface BridgeTransfer {
  orderId: string;
  routeId: string;
  stage: "created" | "left_source" | "on_intermediate" | "sent_to_payout" | "landed" | "failed";
  amount: string;
  finalRecipient: string;
  toChainId: number;
  /** What blocks progress, in words an operator can act on. Null when it is moving. */
  waitingFor: string | null;
  lastError: string | null;
  legs: Array<{ name: string; chainId: number; txHash: string | null; note?: string }>;
}

interface Payout {
  state: string;
  /** Which provider this order actually went through. */
  provider?: string;
  /** Which bridge carried it, when it had to cross a chain. Null for a same-chain payment. */
  bridgeRoute?: string | null;
  fromAmount: string | null;
  depositAddress: string | null;
  drawTxHash: string | null;
  repayTxHashes: string[];
  settledAt: string | null;
  cedarTransactionId: number | null;
  cedarClientStatus: string | null;
  cedarPayoutStatus: string | null;
  lastError: string | null;
}

interface Settlement {
  principal: string;
  principalCleared: string;
  profit: string;
  outstanding: string;
  fullyRepaid: boolean;
}

interface Health {
  cedarEnv: string;
  chainId: number;
  vault: string;
  chain: string;
  /**
   * Reachability per provider. One field for all of them was wrong in a way that only showed
   * once there was a second route: an operator paying through one provider read a red badge
   * about another and concluded their payment could not go out.
   */
  providers?: Array<{ id: string; label: string; ok: boolean; detail: string }>;
  bridgeRoutes?: Array<{ id: string; available: boolean; reason: string | null }>;
  /** Deprecated, kept so this renders against an API deployed before `providers` existed. */
  cedar: string;
  liquidity?: string;
  outstanding?: string;
  totalAssets?: string;
  warnings: string[];
}

interface Step {
  step: string;
  ok: boolean;
  detail?: string;
}

// --------------------------------------------------------------------------- helpers

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/settlement/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  // The service already says what went wrong and why; surfacing its message beats
  // replacing it with a generic one.
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

/**
 * Where a transaction on this deployment can be looked up.
 *
 * Derived from the chain the API reports rather than from an environment variable. The
 * variable was a single value for every chain, so once the settlement vault moved to Arc
 * every hash in this console linked to Basescan, where it does not exist. An operator
 * following that link concludes the payment never happened.
 */
const EXPLORERS: Record<number, string> = {
  1: "https://etherscan.io",
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",
  5042002: "https://testnet.arcscan.app",
  288: "https://bobascan.com",
  28882: "https://testnet.bobascan.com",
};

/**
 * Chain names, so the status bar reads as a place rather than a number.
 *
 * "Chain 5042002" tells an operator nothing, and the whole reason this bar exists is to
 * let them confirm at a glance that they are about to move money on the network they
 * think they are on.
 */
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  84532: "Base Sepolia",
  5042002: "Arc Testnet",
  288: "Boba",
  28882: "Boba Sepolia",
};

const chainName = (id: number | undefined) =>
  id === undefined ? "unknown" : (CHAIN_NAMES[id] ?? `chain ${id}`);

function explorerFor(chainId: number | undefined): string {
  return (
    (chainId !== undefined ? EXPLORERS[chainId] : undefined) ??
    process.env.NEXT_PUBLIC_EXPLORER_URL ??
    "https://basescan.org"
  );
}

const usd = (base: string | null | undefined) =>
  base === null || base === undefined ? "-" : `${(Number(base) / 1e6).toFixed(2)} USDC`;

const fiat = (v: string | null, ccy: string) =>
  v === null ? "-" : `${Number(v).toLocaleString("fr-FR")} ${ccy}`;

/**
 * Where the order actually is, in one phrase.
 *
 * Deliberately derived from intake state and payout state together. Either alone is
 * misleading: an intake reads "consumed" while the supplier is still being paid, and a
 * payout that does not exist yet says nothing about whether the client has paid us.
 */
function phaseOf(o: Order): { label: string; tone: "wait" | "ready" | "done" | "bad" } {
  if (o.state === "cancelled") return { label: "Cancelled", tone: "bad" };
  if (o.payout?.state === "failed") return { label: "Failed", tone: "bad" };
  if (o.payout?.settledAt) return { label: "Settled", tone: "done" };
  // Drawn, but the capital has not reached the provider yet. Showing "Supplier paid" here would
  // be the single most misleading thing this screen could say.
  if (o.payout?.state === "bridging") return { label: "Capital in transit", tone: "wait" };
  if (o.payout?.drawTxHash) return { label: "Supplier paid", tone: "done" };
  if (o.state === "funded") return { label: "Ready to pay", tone: "ready" };
  return { label: "Awaiting funds", tone: "wait" };
}

function Badge({ label, tone }: { label: string; tone: "wait" | "ready" | "done" | "bad" }) {
  const cls = {
    wait: "border-ink/20 text-ink3",
    ready: "border-accent/40 text-accent",
    done: "border-accent/40 text-accent",
    bad: "border-red-500/30 text-red-700",
  }[tone];
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${cls}`}>{label}</span>
  );
}

/**
 * Where an order's capital is while it crosses a chain.
 *
 * Deliberately shows the legs, including the ones nobody here performed. A withdrawal finalised
 * by someone else is work that happened, and a gap where it should be reads like a missing step
 * rather than like a step done elsewhere.
 */
function CapitalInTransit({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [transfer, setTransfer] = useState<BridgeTransfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ transfer: BridgeTransfer }>(
        `orders/${encodeURIComponent(orderId)}/bridge`,
      );
      setTransfer(r.transfer);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function advance() {
    setBusy(true);
    try {
      const r = await api<{ transfer: BridgeTransfer }>(
        `orders/${encodeURIComponent(orderId)}/bridge/advance`,
        { method: "POST" },
      );
      setTransfer(r.transfer);
      setError(null);
      // The payout only leaves `bridging` once the payee holds the funds, so the parent is
      // refreshed on every advance rather than only on the last one.
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const STAGES: Record<BridgeTransfer["stage"], string> = {
    created: "Waiting to leave",
    left_source: "Left the vault's chain",
    on_intermediate: "Arrived part of the way",
    sent_to_payout: "Sent to the payout chain",
    landed: "With the provider",
    failed: "Given up on",
  };

  if (error) return <div className="card border-red-500/30 p-4 text-sm text-red-700">{error}</div>;
  if (!transfer) return <div className="card p-5 text-sm text-muted">Loading transfer...</div>;

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-medium">Capital in transit</h3>
        <Badge
          label={STAGES[transfer.stage]}
          tone={transfer.stage === "landed" ? "done" : transfer.stage === "failed" ? "bad" : "wait"}
        />
        <span className="text-xs text-muted">over {transfer.routeId}</span>
      </div>

      <p className="text-sm text-ink2">
        {usd(transfer.amount)} left the vault and is on its way to {transfer.finalRecipient} on
        chain {transfer.toChainId}. The supplier has not been paid yet.
      </p>

      {transfer.waitingFor && (
        <div className="rounded-sm border border-line p-3 text-sm">
          <span className="text-muted">Waiting for </span>
          {transfer.waitingFor}
        </div>
      )}

      {transfer.lastError && (
        <div className="rounded-sm border border-red-500/30 p-3 text-sm text-red-700">
          {transfer.lastError}
        </div>
      )}

      <div className="space-y-1">
        {transfer.legs.map((leg, i) => (
          <div key={`${leg.name}-${i}`} className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className="w-20 shrink-0 text-muted">{leg.name}</span>
            <span className="text-xs text-ink2">chain {leg.chainId}</span>
            {leg.txHash ? (
              <span className="break-all font-mono text-xs">{leg.txHash}</span>
            ) : (
              <span className="text-xs text-muted">not our transaction</span>
            )}
            {leg.note && <span className="block w-full text-xs text-muted">{leg.note}</span>}
          </div>
        ))}
      </div>

      {transfer.stage !== "landed" && transfer.stage !== "failed" && (
        <button type="button" className="btn btn-ghost" onClick={advance} disabled={busy}>
          {busy ? "Checking..." : "Check and advance"}
        </button>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- root

export function SettlementAdmin() {
  const [tab, setTab] = useState<"operations" | "merchants" | "overview">("operations");
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await api<Health>("health"));
      setHealthError(null);
    } catch (e) {
      setHealthError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  return (
    <div>
      <HealthBar health={health} error={healthError} onRefresh={loadHealth} />

      <div className="card mt-6 flex items-stretch overflow-hidden">
        {(["operations", "merchants", "overview"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-5 py-3 text-sm capitalize transition-colors ${
              tab === k ? "text-ink" : "text-ink3 hover:text-ink2"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "operations" && <Operations chainId={health?.chainId} />}
        {tab === "merchants" && <Merchants />}
        {tab === "overview" && <Overview health={health} />}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- health

/**
 * Shown above everything, always.
 *
 * The three things that break in practice, a blocked IP, an unfunded vault and an
 * unreachable chain, are all invisible until a payment fails halfway. Putting them at the
 * top costs one line and answers "can this work right now" before anyone tries.
 */
function HealthBar({
  health,
  error,
  onRefresh,
}: {
  health: Health | null;
  error: string | null;
  onRefresh: () => void;
}) {
  if (error) {
    return (
      <div className="card border-red-500/30 p-4 text-sm text-red-700">
        Settlement service unreachable: {error}
        <button type="button" onClick={onRefresh} className="btn btn-ghost ml-3">
          Retry
        </button>
      </div>
    );
  }
  if (!health) return <div className="card p-4 text-sm text-muted">Checking services...</div>;

  const cedarOk = health.cedar === "ok";
  const chainOk = health.chain === "ok";

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className={chainOk ? "text-accent" : "text-red-700"}>
          {chainName(health.chainId)} {chainOk ? "ok" : health.chain}
        </span>
        {/*
          The vault this console is actually driving, linked. An operator about to release
          capital should be able to check the contract without trusting the label above it.
        */}
        <a
          className="text-ink2 underline decoration-ink/20 hover:decoration-ink"
          href={`${explorerFor(health.chainId)}/address/${health.vault}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Vault {health.vault.slice(0, 6)}...{health.vault.slice(-4)}
        </a>
        {/*
          One badge per provider. A single shared one was wrong once there was a second route:
          an operator paying through Mansa would read a red badge about Cedar and conclude their
          payment could not go out. The `providers` fallback keeps this rendering against an API
          deployed before the field existed.
        */}
        {(health.providers ?? [{ id: "cedar", label: "Provider", ok: cedarOk, detail: health.cedar }]).map(
          (p) => (
            <span key={p.id} className={p.ok ? "text-accent" : "text-red-700"} title={p.detail}>
              {p.label} {p.ok ? "ok" : p.detail}
            </span>
          ),
        )}
        {/*
          Shown only when routes exist, because most deployments have none and should not be
          asked to think about bridges they do not use.
        */}
        {health.bridgeRoutes?.map((r) => (
          <span key={r.id} className={r.available ? "text-ink2" : "text-red-700"}>
            Path {r.id} {r.available ? "ready" : (r.reason ?? "unavailable")}
          </span>
        ))}
        <span className="text-ink2">Liquidity {usd(health.liquidity)}</span>
        <span className="text-ink2">Outstanding {usd(health.outstanding)}</span>
        <button type="button" onClick={onRefresh} className="btn btn-ghost ml-auto">
          Refresh
        </button>
      </div>
      {health.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-ink3">
          {health.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------- operations

function Operations({ chainId }: { chainId?: number }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const { results } = await api<{ results: Order[] }>("orders");
      setOrders(results);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (selected) {
    return (
      <OrderDetail
        chainId={chainId}
        orderId={selected}
        onBack={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Operations</h2>
        <button type="button" className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "New payment"}
        </button>
      </div>

      {creating && (
        <NewOrder
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      {error && <div className="card border-red-500/30 p-4 text-sm text-red-700">{error}</div>}

      <div className="card divide-y divide-ink/10">
        {orders.length === 0 && (
          <div className="p-6 text-sm text-muted">No operations yet.</div>
        )}
        {orders.map((o) => {
          const phase = phaseOf(o);
          return (
            <button
              key={o.orderId}
              type="button"
              onClick={() => setSelected(o.orderId)}
              className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-ink/5"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{o.orderId}</div>
                <div className="truncate text-xs text-muted">
                  {o.clientName} to {o.supplierName}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm">
                  {Number(o.toAmount).toLocaleString("fr-FR")} {o.toCurrency}
                </div>
                <div className="mt-1">
                  <Badge label={phase.label} tone={phase.tone} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewOrder({ onCreated }: { onCreated: () => void }) {
  const [f, setF] = useState({
    orderId: "",
    clientName: "",
    clientReference: "",
    supplierName: "",
    supplierAccountId: "",
    toAmount: "",
    toCurrency: "CNY",
    fiatCurrency: "XOF",
    fiatExpected: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("orders", { method: "POST", body: JSON.stringify(f) });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Order reference" value={f.orderId} onChange={set("orderId")}
          hint="e.g. TP-ML-CN-2026-000124" />
        <Field label="Client reference" value={f.clientReference} onChange={set("clientReference")} />
        <Field label="Client" value={f.clientName} onChange={set("clientName")} />
        <Field label="Supplier" value={f.supplierName} onChange={set("supplierName")} />
        <Field label="Supplier account id" value={f.supplierAccountId}
          onChange={set("supplierAccountId")} hint="provider account, if already registered" />
        <Field label={`Amount to supplier (${f.toCurrency})`} value={f.toAmount} onChange={set("toAmount")} />
        <Field label={`Expected from client (${f.fiatCurrency})`} value={f.fiatExpected}
          onChange={set("fiatExpected")} />
      </div>
      {error && <div className="text-sm text-red-700">{error}</div>}
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? "Creating..." : "Create operation"}
        </button>
        <span className="text-xs text-muted">
          Recorded as awaiting funds. Nothing is paid until the transfer is confirmed.
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input mt-1 w-full" value={value} onChange={onChange} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

// --------------------------------------------------------------------- order detail

function OrderDetail({ orderId, onBack, chainId }: { orderId: string; onBack: () => void; chainId?: number }) {
  const [data, setData] = useState<{
    intake: Order;
    payout: Payout | null;
    settlement: Settlement | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [providers, setProviders] = useState<PayoutProviderOption[] | null>(null);
  const [provider, setProvider] = useState<string>("");
  const [routes, setRoutes] = useState<BridgeRouteOption[] | null>(null);
  const [route, setRoute] = useState<string>("");
  const [capacity, setCapacity] = useState<BridgeCapacity | null>(null);
  const [capacityLoading, setCapacityLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`orders/${encodeURIComponent(orderId)}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Asked for once the order is loaded, with its corridor, so "can this provider be used"
  // is answered about this payment rather than in general.
  const intakeForRoute = data?.intake;
  useEffect(() => {
    if (!intakeForRoute) return;
    const q = new URLSearchParams({
      toAmount: intakeForRoute.toAmount,
      toCurrency: intakeForRoute.toCurrency,
      destinationCountryIso: intakeForRoute.destinationCountryIso ?? "",
    });
    void api<{ default: string; results: PayoutProviderOption[] }>(`payout-providers?${q}`)
      .then((r) => {
        setProviders(r.results);
        // Preselect the configured default when it can actually serve this order, rather
        // than the first row, which may be a route that cannot be used.
        const usable = r.results.filter((p) => p.available && p.supportsRoute !== false);
        setProvider(
          usable.find((p) => p.id === r.default)?.id ?? usable[0]?.id ?? "",
        );
      })
      .catch(() => setProviders([]));
  }, [intakeForRoute]);

  const chosen = providers?.find((p) => p.id === provider);
  const needsBridge = chosen?.needsBridge === true;
  const settlesOn = chosen?.settlementChainId ?? null;

  /**
   * Asked only once a provider is chosen, and only for the chain THAT provider settles on.
   *
   * Offering every route the deployment knows would make the operator work out which ones apply.
   * Offering none would hide a choice that changes how long the payment takes by a week.
   */
  useEffect(() => {
    if (!needsBridge || settlesOn === null) {
      setRoutes(null);
      setRoute("");
      return;
    }
    void api<{ results: BridgeRouteOption[] }>(`bridge-routes?toChainId=${settlesOn}`)
      .then((r) => {
        setRoutes(r.results);
        setRoute(r.results.find((x) => x.available)?.id ?? "");
      })
      .catch(() => setRoutes([]));
  }, [needsBridge, settlesOn]);

  /**
   * Ask the chosen route what it will carry, as soon as it is chosen.
   *
   * Before the payment rather than during it. The backend refuses independently when the payment is
   * executed, and that refusal is the actual control; this one exists so an operator is not told
   * about a ceiling only after committing an order and watching it fail with a supplier waiting.
   */
  useEffect(() => {
    if (!route) {
      setCapacity(null);
      return;
    }
    let cancelled = false;
    setCapacityLoading(true);
    void api<BridgeCapacity>(`bridge-routes/${encodeURIComponent(route)}/capacity`)
      .then((c) => {
        if (!cancelled) setCapacity(c);
      })
      .catch(() => {
        if (!cancelled) setCapacity(null);
      })
      .finally(() => {
        if (!cancelled) setCapacityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route]);

  /**
   * Whether this payment can fit through the chosen route.
   *
   * Compared against the ceiling the APPROVER attested, which is the upper bound on what the vault
   * can be asked to release for this order. The exact USDC figure is not known until the provider
   * quotes, inside execute, so the attested ceiling is the honest thing to check here: if even the
   * bound fits, nothing the provider quotes can overflow the route.
   */
  const routeCeiling = capacity?.max === null || capacity?.max === undefined ? null : BigInt(capacity.max);
  const attested = data?.intake.maxAmount ? BigInt(data.intake.maxAmount) : null;
  const overCeiling = needsBridge && routeCeiling !== null && attested !== null && attested > routeCeiling;

  if (error) return <div className="card border-red-500/30 p-4 text-sm text-red-700">{error}</div>;
  if (!data) return <div className="card p-6 text-sm text-muted">Loading...</div>;

  const { intake, payout, settlement } = data;
  const phase = phaseOf({ ...intake, payout });

  async function execute() {
    setBusy("execute");
    setSteps(null);
    try {
      const res = await api<{ ok: boolean; steps: Step[] }>(
        `orders/${encodeURIComponent(orderId)}/execute`,
        {
          method: "POST",
          body: JSON.stringify({
            supplierAccountId: intake.supplierAccountId,
            provider,
            // Sent only when one is needed. An empty string would be read as a named route that
            // does not exist, and the order would be refused for the wrong reason.
            ...(needsBridge && route ? { bridgeRoute: route } : {}),
          }),
        },
      );
      setSteps(res.steps);
      await load();
    } catch (e) {
      setSteps([{ step: "failed", ok: false, detail: (e as Error).message }]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <h2 className="text-lg font-semibold tracking-tight">{intake.orderId}</h2>
        <Badge label={phase.label} tone={phase.tone} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Client" value={intake.clientName} sub={intake.clientReference ?? undefined} />
        <Stat label="Supplier" value={intake.supplierName} />
        <Stat
          label="Supplier receives"
          value={`${Number(intake.toAmount).toLocaleString("fr-FR")} ${intake.toCurrency}`}
        />
        <Stat
          label="Expected from client"
          value={fiat(intake.fiatExpected, intake.fiatCurrency)}
          sub={intake.fiatReceived ? `received ${fiat(intake.fiatReceived, intake.fiatCurrency)}` : undefined}
        />
      </div>

      {intake.state === "pending_funds" && <ConfirmFunds intake={intake} onDone={load} />}

      {intake.state === "funded" && !payout?.drawTxHash && (
        <div className="card space-y-5 p-5">
          <div>
            <h3 className="font-medium">Execute payment</h3>
            <p className="mt-1 text-sm text-ink2">
              Funds attested by {intake.approver} up to {usd(intake.maxAmount)}. The vault
              sends USDC to the provider, which pays the supplier in{" "}
              {intake.toCurrency}.
            </p>
          </div>

          <Beneficiary intake={intake} />

          <div>
            <div className="label">Send through</div>
            {providers === null && <div className="mt-2 text-sm text-muted">Loading routes...</div>}
            <div className="mt-2 space-y-2">
              {providers?.map((p) => {
                // Two different refusals, and an operator can act on each. One is a
                // missing credential; the other means this corridor needs another route.
                const blocked = !p.available
                  ? p.reason
                  : p.supportsRoute === false
                    ? `does not serve ${intake.toCurrency} to ${intake.destinationCountryIso ?? "this destination"}`
                    : null;
                return (
                  <label
                    key={p.id}
                    className={`flex items-start gap-3 rounded-sm border p-3 ${
                      blocked ? "border-line opacity-60" : "hairline cursor-pointer"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payout-provider"
                      className="mt-1"
                      value={p.id}
                      checked={provider === p.id}
                      disabled={blocked !== null}
                      onChange={() => setProvider(p.id)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{p.label}</span>
                      {blocked && <span className="block text-xs text-muted">{blocked}</span>}
                    </span>
                  </label>
                );
              })}
              {providers?.length === 0 && (
                <div className="text-sm text-red-700">No payout provider is configured.</div>
              )}
            </div>
          </div>

          {/*
            Shown only when the chosen provider settles somewhere other than the vault's chain.
            For a same-chain payment there is nothing to cross and no choice to make, which is
            the arrangement to prefer and the reason this section usually is not here.
          */}
          {needsBridge && (
            <div>
              <div className="label">Path off chain {chainId}</div>
              <p className="mt-1 text-sm text-ink2">
                {chosen?.label} wants the deposit on chain {settlesOn}. The vault can only pay on
                chain {chainId}, so the capital has to cross. This choice decides how long that
                takes and who holds the funds on the way.
              </p>
              {routes === null && <div className="mt-2 text-sm text-muted">Loading paths...</div>}
              <div className="mt-2 space-y-2">
                {routes?.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-start gap-3 rounded-sm border p-3 ${
                      r.available ? "hairline cursor-pointer" : "border-line opacity-60"
                    }`}
                  >
                    <input
                      type="radio"
                      name="bridge-route"
                      className="mt-1"
                      value={r.id}
                      checked={route === r.id}
                      disabled={!r.available}
                      onChange={() => setRoute(r.id)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{r.label}</span>
                      <span className="block text-xs text-ink2">
                        Takes {r.expectedDuration}
                        {r.intermediateChainId !== null && `, via chain ${r.intermediateChainId}`}
                      </span>
                      {/* Named as-is: it says what is missing and who can fix it. */}
                      {!r.available && r.reason && (
                        <span className="block text-xs text-muted">{r.reason}</span>
                      )}
                    </span>
                  </label>
                ))}
                {routes?.length === 0 && (
                  <div className="text-sm text-red-700">
                    No path is configured from chain {chainId} to chain {settlesOn}, so this
                    provider cannot be paid from this vault. Pick another provider, or have a
                    route configured.
                  </div>
                )}
              </div>

              {/*
                The ceiling, shown before the payment rather than discovered during it. A liquidity
                route fronts the funds from an inventory that moves hour to hour, so this is a
                market fact and not a setting. The backend checks it again at execution; this is
                here so nobody commits an order to a route that cannot carry it.
              */}
              {route && (
                <div className="mt-3 rounded-sm border border-line p-3 text-sm">
                  {capacityLoading && <span className="text-muted">Checking what this path can carry...</span>}
                  {!capacityLoading && capacity === null && (
                    <span className="text-muted">
                      Could not reach the bridge to ask its limit. The payment will still be
                      refused at execution if it is too large.
                    </span>
                  )}
                  {!capacityLoading && capacity !== null && routeCeiling === null && (
                    <span className="text-ink2">
                      No ceiling on this path: it carries any amount, and takes{" "}
                      {routes?.find((r) => r.id === route)?.expectedDuration} about it.
                    </span>
                  )}
                  {!capacityLoading && routeCeiling !== null && (
                    <>
                      <span className={overCeiling ? "text-red-700" : "text-ink2"}>
                        This path can carry up to {usd(routeCeiling.toString())} right now.
                      </span>
                      {overCeiling && (
                        <span className="mt-1 block text-red-700">
                          The attested ceiling for this order is {usd(intake.maxAmount)}, which is
                          more than the path will take. Choose a path with no ceiling, or have the
                          order split deliberately into several orders: paying part of an invoice
                          is worse for the supplier than paying all of it later.
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={execute}
            // A bridged payment with no path chosen would be refused at quote time. Refusing to
            // start it is the same answer, given before anything is created.
            // Blocked on the ceiling too. The backend refuses independently, which is what makes
            // this a convenience rather than the control, but letting the click through would
            // create an order that cannot be paid.
            disabled={
              busy === "execute" || provider === "" || (needsBridge && route === "") || overCeiling
            }
          >
            {busy === "execute" ? "Executing..." : "Execute payment"}
          </button>
        </div>
      )}

      {/*
        The one state this screen must not round off. The vault has paid, the merchant has been
        debited, and the supplier has not been paid: an operator looking at this order needs to
        see where the money actually is and what it is waiting for.
      */}
      {payout?.state === "bridging" && <CapitalInTransit orderId={orderId} onDone={load} />}

      {/*
        Nothing else moves a payout to completed: this service has no webhook route, so an order
        nobody asks about stays at "with the provider" indefinitely. The button is here rather than
        on a timer because asking costs a call to the provider's API.
      */}
      {payout?.state === "deposit_approved" && (
        <div className="card flex flex-wrap items-center gap-3 p-5">
          <div className="min-w-0">
            <h3 className="font-medium">With the payment provider</h3>
            <p className="mt-1 text-sm text-ink2">
              The provider has the funds and is crediting the supplier&apos;s bank. Ask it where the
              payment is; it completes here only once the provider says it arrived.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost ml-auto"
            disabled={busy === "poll"}
            onClick={async () => {
              setBusy("poll");
              try {
                await api(`orders/${encodeURIComponent(orderId)}/poll`, { method: "POST" });
                await load();
              } catch (e) {
                setSteps([{ step: "poll", ok: false, detail: (e as Error).message }]);
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "poll" ? "Asking..." : "Ask the provider"}
          </button>
        </div>
      )}

      {steps && <StepList steps={steps} />}

      {payout && <Reconciliation intake={intake} payout={payout} settlement={settlement} chainId={chainId} />}

      {payout?.drawTxHash && !payout.settledAt && (
        <Repay orderId={orderId} settlement={settlement} onDone={load} />
      )}

      <AuditTrail intake={intake} payout={payout} />
    </div>
  );
}

/**
 * The attestation step.
 *
 * The wallet opens and the admin signs, but nothing is sent to any chain and no gas is
 * spent. What is produced is a statement, bound to this order and to a ceiling, that the
 * client's money is in the bank account. The vault refuses to release funds without it.
 */
function ConfirmFunds({ intake, onDone }: { intake: Order; onDone: () => void }) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [fiatReceived, setFiatReceived] = useState(intake.fiatExpected);
  const [bankReference, setBankReference] = useState("");
  const [ceiling, setCeiling] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!address) {
      setError("Connect the approver wallet first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const maxAmount = (BigInt(Math.round(Number(ceiling) * 1e6)) * 1n).toString();
      if (BigInt(maxAmount) <= 0n) throw new Error("Authorised ceiling must be above zero.");

      // The payload is served by the backend rather than rebuilt here, so the EIP-712
      // domain cannot drift from the deployed contract. A mismatch would verify in the
      // browser and revert on-chain, which surfaces only at payment time.
      const payload = await api<{
        domain: Record<string, unknown>;
        types: Record<string, unknown>;
        primaryType: string;
        message: { orderRef: string; maxAmount: string; deadline: string };
      }>(`orders/${encodeURIComponent(intake.orderId)}/approval?maxAmount=${maxAmount}`);

      // Cast wholesale: the typed-data shape is decided by the backend at runtime, so the
      // compiler cannot narrow it here. What guarantees correctness is that the vault
      // verifies the same digest, and a mismatch is caught there rather than by types.
      const signature = await signTypedDataAsync({
        domain: payload.domain,
        types: payload.types,
        primaryType: payload.primaryType,
        message: {
          orderRef: payload.message.orderRef,
          maxAmount: BigInt(payload.message.maxAmount),
          deadline: BigInt(payload.message.deadline),
        },
      } as unknown as Parameters<typeof signTypedDataAsync>[0]);

      await api(`orders/${encodeURIComponent(intake.orderId)}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          fiatReceived,
          bankReference,
          approver: address,
          maxAmount: payload.message.maxAmount,
          deadline: payload.message.deadline,
          signature,
        }),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h3 className="font-medium">Confirm funds received</h3>
        <p className="mt-1 text-sm text-ink2">
          Sign to attest the client&apos;s transfer landed. This opens your wallet but sends no
          transaction and costs no gas. Until it is signed, no payment can be made.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={`Received (${intake.fiatCurrency})`}
          value={fiatReceived}
          onChange={(e) => setFiatReceived(e.target.value)}
        />
        <Field
          label="Bank reference"
          value={bankReference}
          onChange={(e) => setBankReference(e.target.value)}
        />
        <Field
          label="Authorised ceiling (USDC)"
          value={ceiling}
          onChange={(e) => setCeiling(e.target.value)}
          hint="upper bound; the exact amount is set by the provider quote"
        />
      </div>
      {error && <div className="text-sm text-red-700">{error}</div>}
      <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
        {busy ? "Waiting for signature..." : "Sign and confirm"}
      </button>
    </div>
  );
}

/**
 * Who is being paid, as the merchant recorded it.
 *
 * Shown at the moment of execution rather than buried in the order, because this is the
 * last point at which a wrong account number can still be caught. Read-only on purpose:
 * the merchant knows their supplier, and a field an operator can retype here is a field
 * where a digit gets transposed under time pressure.
 */
function Beneficiary({ intake }: { intake: Order }) {
  const rows: Array<[string, string | null]> = [
    ["Name", intake.supplierName],
    ["Bank account", intake.supplierBankAccount],
    ["Bank", intake.supplierBankName],
    ["SWIFT/BIC", intake.supplierSwift],
    ["Destination", intake.destinationCountryIso],
    ["Provider account id", intake.supplierAccountId ? String(intake.supplierAccountId) : null],
  ];
  return (
    <div className="hairline rounded-sm border p-4">
      <div className="label">Beneficiary</div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            {/*
              An empty field is shown as empty rather than hidden. Orders created before
              these were persisted have no answer, and a row that disappears looks like a
              supplier with no bank account rather than a record with a gap.
            */}
            <dd className={`truncate ${v ? "text-ink" : "text-ink3"}`}>{v ?? "not recorded"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <div className="card p-5">
      <h3 className="font-medium">Execution</h3>
      <ol className="mt-3 space-y-2 text-sm">
        {steps.map((s, i) => (
          <li key={`${s.step}-${i}`} className="flex gap-3">
            <span className={s.ok ? "text-accent" : "text-red-700"}>{s.ok ? "ok" : "failed"}</span>
            <span className="capitalize text-ink">{s.step}</span>
            {s.detail && <span className="truncate text-muted">{s.detail}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Reconciliation({
  intake,
  payout,
  settlement,
  chainId,
}: {
  intake: Order;
  payout: Payout;
  settlement: Settlement | null;
  chainId?: number;
}) {
  const explorer = explorerFor(chainId);
  return (
    <div className="card space-y-4 p-5">
      <h3 className="font-medium">Reconciliation</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Collected from client" value={fiat(intake.fiatReceived, intake.fiatCurrency)} />
        <Stat label="Sent to provider" value={usd(payout.fromAmount ? String(Math.round(Number(payout.fromAmount) * 1e6)) : null)} />
        <Stat
          label="Supplier receives"
          value={`${Number(intake.toAmount).toLocaleString("fr-FR")} ${intake.toCurrency}`}
        />
        <Stat label="Gross margin" value={settlement ? usd(settlement.profit) : "pending repayment"} />
      </div>
      {payout.drawTxHash && (
        <div className="text-sm">
          <span className="text-muted">Settlement transaction </span>
          <a
            className="underline"
            href={`${explorer}/tx/${payout.drawTxHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {payout.drawTxHash.slice(0, 18)}...
          </a>
        </div>
      )}
      {payout.lastError && <div className="text-sm text-red-700">{payout.lastError}</div>}
    </div>
  );
}

function Repay({
  orderId,
  settlement,
  onDone,
}: {
  orderId: string;
  settlement: Settlement | null;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(`orders/${encodeURIComponent(orderId)}/repay`, {
        method: "POST",
        body: JSON.stringify({ amount: (BigInt(Math.round(Number(amount) * 1e6))).toString() }),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-5">
      <h3 className="font-medium">Record repayment</h3>
      <p className="text-sm text-ink2">
        Outstanding {settlement ? usd(settlement.outstanding) : "-"}. Anything above it is booked
        as margin.
      </p>
      <div className="flex items-end gap-3">
        <Field label="Amount (USDC)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? "Recording..." : "Record"}
        </button>
      </div>
      {error && <div className="text-sm text-red-700">{error}</div>}
    </div>
  );
}

/**
 * Assembled from timestamps already recorded rather than a separate event log.
 *
 * A second log written alongside the state changes would be free to disagree with them,
 * and the disagreement would only ever be noticed during an audit.
 */
function AuditTrail({ intake, payout }: { intake: Order; payout: Payout | null }) {
  const rows: Array<[string, string | null]> = [
    ["Order recorded", intake.createdAt],
    ["Funds attested", intake.fundedAt],
    ["Provider", payout?.provider ?? null],
    // Recorded per order, so this answers "which path did this payment take" without anyone
    // having to read today's configuration.
    ["Path off chain", payout?.bridgeRoute ?? null],
    ["Provider quote", payout?.fromAmount ? `${payout.fromAmount} USDC` : null],
    ["Settlement executed", payout?.drawTxHash ?? null],
    ["Provider notified", payout?.cedarPayoutStatus ?? null],
    ["Repayments", payout?.repayTxHashes.length ? `${payout.repayTxHashes.length}` : null],
    // The vault's receivable being repaid, which is between the platform and its LPs. It is not
    // the supplier being paid, and it is labelled so it cannot be read as such.
    ["Vault repaid", payout?.settledAt ?? null],
  ];
  return (
    <div className="card p-5">
      <h3 className="font-medium">Audit trail</h3>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className={`truncate ${v ? "text-ink" : "text-ink3"}`}>{v ?? "pending"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ------------------------------------------------------------------------ merchants

function Merchants() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { results } = await api<{ results: Record<string, unknown>[] }>("merchants");
        setRows(results);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="card border-red-500/30 p-5 text-sm text-red-700">
        Cannot list merchants: {error}
      </div>
    );
  }

  return (
    <div className="card divide-y divide-ink/10">
      {rows.length === 0 && <div className="p-6 text-sm text-muted">No merchants.</div>}
      {rows.map((m) => (
        <div key={String(m.id)} className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <div className="truncate font-medium">{String(m.name)}</div>
            <div className="text-xs text-muted">
              {String(m.countryIso ?? "")} {String(m.industry ?? "")}
            </div>
          </div>
          <Badge
            label={`KYB ${String(m.kycStatus ?? "unknown")}`}
            tone={m.kycStatus === "VALID" ? "done" : "wait"}
          />
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------- overview

function Overview({ health }: { health: Health | null }) {
  const [stats, setStats] = useState<Record<string, number | string | null> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setStats(await api("stats"));
      } catch {
        setStats(null);
      }
    })();
  }, []);

  if (!stats) return <div className="card p-6 text-sm text-muted">No data yet.</div>;

  const avg = stats.avgSettlementMs as number | null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Operations" value={String(stats.orders)} />
      <Stat label="Awaiting funds" value={String(stats.awaitingFunds)} />
      <Stat label="Ready to pay" value={String(stats.funded)} />
      <Stat label="Settled" value={String(stats.settled)} />
      <Stat label="Suppliers paid" value={String(stats.drawn)} />
      <Stat label="Failed" value={String(stats.failed)} />
      <Stat
        label="Avg time to settlement"
        value={avg ? `${Math.round(avg / 60_000)} min` : "-"}
        sub="from order recorded to supplier paid"
      />
      <Stat label="Available liquidity" value={usd(health?.liquidity)} />
    </div>
  );
}
