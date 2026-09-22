"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, useReadContract, useSignTypedData, useSwitchChain } from "wagmi";
import type { Hex } from "viem";
import { money, toMinor } from "@/lib/merchant";
import { wagmiConfig } from "@/lib/wagmi";
import type { ConfiguredChainId } from "@/lib/contracts";
import {
  confirmDeposit,
  depositAttestation,
  listDeposits,
  listMerchants,
  recordDeposit,
  vaultInfo,
  type VaultInfo,
  type PlatformDeposit,
  type PlatformMerchant,
} from "@/lib/platform";

/**
 * Deposits: money physically received, and the signature that releases it.
 *
 * The two halves are deliberately separate. Recording is bookkeeping, done by whoever took
 * the cash or read the bank statement. Confirming is an attestation, signed in a wallet by
 * someone the vault recognises, and it is the only thing standing between a merchant's
 * balance and real USDC leaving the vault.
 *
 * Nothing here touches the chain. The signature is a message, costs no gas, and produces
 * no transaction: the backend signs the transaction separately, later, and the vault
 * checks both. That is the whole point of the split, so the screen says so rather than
 * letting an operator assume they just moved money.
 */
const CURRENCIES = ["XOF", "EUR", "USD"] as const;
const DEFAULT_DEADLINE_DAYS = 30;

export function DepositsPanel({
  initialMerchantId,
  onChanged,
}: {
  initialMerchantId?: string | null;
  /** Called after a deposit is recorded or attested, so the counters re-read. */
  onChanged?: () => void;
}) {
  const [merchants, setMerchants] = useState<PlatformMerchant[]>([]);
  const [merchantId, setMerchantId] = useState<string>("");
  const [deposits, setDeposits] = useState<PlatformDeposit[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMerchants("approved")
      .then((ms) => {
        setMerchants(ms);
        const wanted = initialMerchantId;
        // Only merchants who passed KYB can hold a balance, so the preselection is
        // ignored rather than honoured if it names someone who has not.
        setMerchantId(
          wanted && ms.some((m) => m.merchantId === wanted) ? wanted : (ms[0]?.merchantId ?? ""),
        );
      })
      .catch((e) => setError((e as Error).message));
  }, [initialMerchantId]);

  const refresh = useCallback(async () => {
    if (!merchantId) return;
    try {
      setDeposits(await listDeposits(merchantId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [merchantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-8">
      <p className="text-sm text-ink2">
        Record what a merchant paid in, then attest it so they can spend it.
      </p>

      {error && <div className="card border-red-500/30 p-5 text-sm text-red-700">{error}</div>}

      <label className="block max-w-sm">
        <span className="label">Merchant</span>
        <select
          className="input mt-1 w-full"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
        >
          {merchants.length === 0 && <option value="">No approved merchant</option>}
          {merchants.map((m) => (
            <option key={m.merchantId} value={m.merchantId}>
              {m.legalName}
            </option>
          ))}
        </select>
      </label>

      {merchantId && (
        <RecordForm
          merchantId={merchantId}
          onDone={() => {
            void refresh();
            onChanged?.();
          }}
        />
      )}

      <div>
        <h3 className="mb-3 font-medium">Recorded</h3>
        <div className="space-y-3">
          {deposits.length === 0 && (
            <div className="card p-6 text-sm text-muted">Nothing recorded for this merchant.</div>
          )}
          {deposits.map((d) => (
            <DepositRow
              key={d.depositId}
              deposit={d}
              onDone={() => {
                void refresh();
                onChanged?.();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------ record

function RecordForm({ merchantId, onDone }: { merchantId: string; onDone: () => void }) {
  const [method, setMethod] = useState<"cash" | "bank_transfer">("bank_transfer");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>("XOF");
  const [evidence, setEvidence] = useState("");
  const [office, setOffice] = useState("");
  const [valueDate, setValueDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await recordDeposit({
        // Generated rather than typed. It only has to be unique and traceable; the
        // number an operator actually cares about is the receipt or bank reference.
        depositId: `dep_${merchantId}_${Date.now()}`,
        merchantId,
        method,
        amount: toMinor(amount, currency),
        currency,
        ...(method === "cash"
          ? { receiptNumber: evidence, office }
          : { bankReference: evidence, valueDate }),
      });
      setAmount("");
      setEvidence("");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <div className="font-medium">Record a deposit</div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Method</span>
          <select
            className="input mt-1 w-full"
            value={method}
            onChange={(e) => setMethod(e.target.value as "cash" | "bank_transfer")}
          >
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash at the office</option>
          </select>
        </label>

        <label className="block">
          <span className="label">Currency</span>
          <select
            className="input mt-1 w-full"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label">Amount</span>
          <input
            className="input mt-1 w-full"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="500000"
          />
        </label>

        {/*
          The evidence field changes with the method because the two are reconciled
          against different things: a receipt book on one side, a bank statement on the
          other. One generic "reference" box would lose which of the two it was.
        */}
        <label className="block">
          <span className="label">
            {method === "cash" ? "Receipt number" : "Bank reference"}
          </span>
          <input
            className="input mt-1 w-full"
            required
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
        </label>

        {method === "cash" ? (
          <label className="block">
            <span className="label">Office</span>
            <input
              className="input mt-1 w-full"
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              placeholder="Bamako"
            />
          </label>
        ) : (
          <label className="block">
            <span className="label">Value date</span>
            <input
              className="input mt-1 w-full"
              type="date"
              value={valueDate}
              onChange={(e) => setValueDate(e.target.value)}
            />
          </label>
        )}
      </div>

      {error && <div className="text-sm text-red-700">{error}</div>}

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Recording..." : "Record"}
      </button>
      <p className="text-xs text-muted">
        Recording does not credit anything. The merchant can spend only once a deposit is
        attested below.
      </p>
    </form>
  );
}

// ----------------------------------------------------------------------------- confirm

function DepositRow({ deposit, onDone }: { deposit: PlatformDeposit; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const confirmed = deposit.state === "confirmed";

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium">{money(deposit.amount, deposit.currency)}</div>
          <div className="mt-0.5 text-xs text-muted">
            {deposit.method === "cash" ? "Cash" : "Bank transfer"} ·{" "}
            {deposit.receiptNumber ?? deposit.bankReference ?? deposit.depositId} ·{" "}
            {new Date(deposit.createdAt).toLocaleDateString("fr-FR")}
          </div>
        </div>
        <div className="text-right">
          <span
            className={`tag ${
              confirmed ? "border-accent/40 text-accent" : "border-line text-muted"
            }`}
          >
            {confirmed ? "Attested" : deposit.state}
          </span>
          {!confirmed && (
            <button
              type="button"
              className="btn btn-secondary ml-3"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Cancel" : "Attest"}
            </button>
          )}
        </div>
      </div>

      {confirmed && (
        <dl className="mt-4 space-y-1 text-xs text-muted">
          <div>Signed by {deposit.approver}</div>
          <div>
            Ceiling {money(deposit.maxAmount, "USDC")}, valid until{" "}
            {deposit.deadline ? new Date(deposit.deadline * 1000).toLocaleString("fr-FR") : "-"}
          </div>
          <div>Confirmed by {deposit.confirmedBy}</div>
        </dl>
      )}

      {open && !confirmed && <AttestForm deposit={deposit} onDone={onDone} />}
    </div>
  );
}

/**
 * The API reports a plain number; wagmi will only read from a chain it was configured with.
 *
 * Narrowed rather than cast, because the mismatch is worth surfacing: a backend driving a
 * vault on a chain this interface does not know is a deployment error, and silently
 * reading from the wrong chain would answer "not an approver" for the wrong reason.
 */
function configuredChain(id: number | undefined): ConfiguredChainId | undefined {
  return wagmiConfig.chains.some((c) => c.id === id) ? (id as ConfiguredChainId) : undefined;
}

/** The one call this screen makes to the chain: may this wallet attest at all. */
const IS_APPROVER_ABI = [
  {
    type: "function",
    name: "isApprover",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

function AttestForm({ deposit, onDone }: { deposit: PlatformDeposit; onDone: () => void }) {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const connectedChain = useChainId();
  const { switchChain } = useSwitchChain();
  const [ceiling, setCeiling] = useState("");
  const [days, setDays] = useState(String(DEFAULT_DEADLINE_DAYS));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Which vault the backend will carry this signature to, asked of the backend itself.
  const [vault, setVault] = useState<VaultInfo | null>(null);
  useEffect(() => {
    void vaultInfo().then(setVault).catch(() => setVault(null));
  }, []);

  const vaultChain = configuredChain(vault?.chainId);

  /**
   * Whether the vault would accept this wallet.
   *
   * Read here rather than left to the backend, even though the backend now checks it too.
   * A signature the chain will refuse is worth catching BEFORE the wallet opens: an
   * operator who signs and is then told it was pointless has to work out whether anything
   * happened, and on a busy day they will assume it did.
   */
  const { data: recognised, isLoading: checkingApprover } = useReadContract({
    address: vault?.vault,
    abi: IS_APPROVER_ABI,
    functionName: "isApprover",
    args: address ? [address] : undefined,
    chainId: vaultChain,
    query: { enabled: Boolean(vaultChain && address) },
  });

  const wrongChain = vault !== null && connectedChain !== vault.chainId;
  // Ordered by what the operator should do first. Connecting a wallet on the wrong network
  // and being told about the approver would send them fixing the second problem first.
  const blocker = !isConnected
    ? "Connect the approver wallet to sign."
    : vault === null
      ? "Cannot reach the settlement service to find out which vault to check against."
      : vaultChain === undefined
        ? `The settlement service drives a vault on chain ${vault.chainId}, which this ` +
          `interface is not configured for. It cannot check who may attest there.`
        : wrongChain
          ? `Your wallet is on chain ${connectedChain}, the vault is on ${vault.chainId}.`
          : checkingApprover
            ? "Checking whether this wallet may attest..."
            : recognised === false
              ? `${address} is not an approver on ${vault.vault}. A signature from it would ` +
                `be refused on-chain, so every payment against this deposit would fail.`
              : null;

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    if (!address) {
      setError("Connect the approver wallet first.");
      return;
    }
    setError(null);
    try {
      const usdcCeiling = toMinor(ceiling, "USDC");
      const deadline = Math.floor(Date.now() / 1000) + Number(days) * 86_400;

      // Fetched, never rebuilt here. The domain carries the vault address and chain id,
      // and a browser-made copy that drifts from the deployed vault signs cleanly and
      // then reverts on-chain, days later, with nothing to point at.
      setBusy("Preparing");
      const payload = await depositAttestation(deposit.depositId, usdcCeiling, deadline);

      setBusy("Waiting for the wallet");
      // Cast wholesale: the typed-data shape is decided by the API at runtime, so the
      // compiler cannot narrow it here. What guarantees correctness is that the vault
      // verifies the same digest, and a mismatch is caught there rather than by types.
      const signature = await signTypedDataAsync({
        domain: payload.domain,
        types: payload.types,
        primaryType: payload.primaryType,
        // The API serialises uint256 as decimal strings; viem hashes numbers, not strings.
        message: {
          approvalRef: payload.message.approvalRef as Hex,
          maxAmount: BigInt(payload.message.maxAmount),
          deadline: BigInt(payload.message.deadline),
        },
      } as unknown as Parameters<typeof signTypedDataAsync>[0]);

      setBusy("Saving");
      await confirmDeposit(deposit.depositId, {
        approver: address,
        usdcCeiling,
        deadline,
        signature,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={sign} className="hairline mt-5 space-y-4 border-t pt-5">
      <p className="text-sm text-ink2">
        You are attesting that {money(deposit.amount, deposit.currency)} really arrived, and
        setting how much of it may leave the vault.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          {/*
            Asked for rather than derived. The deposit is in local currency and the ceiling
            is in USDC; converting between them is a pricing decision, and whoever signs is
            the one accountable for it.
          */}
          <span className="label">Ceiling in USDC</span>
          <input
            className="input mt-1 w-full"
            inputMode="decimal"
            required
            value={ceiling}
            onChange={(e) => setCeiling(e.target.value)}
            placeholder="5000"
          />
          <span className="mt-1 block text-xs text-muted">
            The most this deposit can ever release, across every payment drawn against it.
          </span>
        </label>

        <label className="block">
          <span className="label">Valid for (days)</span>
          <input
            className="input mt-1 w-full"
            inputMode="numeric"
            required
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <span className="mt-1 block text-xs text-muted">
            After this, the signature is dead and the balance needs attesting again.
          </span>
        </label>
      </div>

      {/*
        Stated before signing rather than after. The vault is the authority on who may
        attest, so the console asks it and reports the answer here, where it can still
        change what the operator does.
      */}
      {blocker ? (
        <div className="hairline rounded-sm border border-red-500/30 p-3 text-sm text-red-700">
          {blocker}
          {wrongChain && vaultChain !== undefined && (
            <button
              type="button"
              className="btn btn-secondary ml-3"
              onClick={() => switchChain({ chainId: vaultChain })}
            >
              Switch network
            </button>
          )}
        </div>
      ) : (
        <div className="text-xs text-muted">
          Signing as {address}, which this vault accepts as an approver.
        </div>
      )}

      {error && <div className="text-sm text-red-700">{error}</div>}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={busy !== null || blocker !== null}
      >
        {busy ?? "Sign the attestation"}
      </button>
      <p className="text-xs text-muted">
        This signs a message. It costs nothing, moves nothing, and produces no transaction.
      </p>
    </form>
  );
}
