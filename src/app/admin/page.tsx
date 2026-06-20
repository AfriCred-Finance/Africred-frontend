"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { waitForTransactionReceipt } from "wagmi/actions";
import { parseUnits, isAddress, keccak256, toBytes, type Address } from "viem";
import { erc20Abi, factoryAbi } from "@/lib/abis";
import { FACTORY_ADDRESS, LZ_ENDPOINT, EXPLORER } from "@/lib/contracts";

const CHAIN_ID = baseSepolia.id;
import { wagmiConfig } from "@/lib/wagmi";
import { ConfigBanner } from "@/components/ConfigBanner";
import { VaultCard } from "@/components/VaultCard";
import { shortAddr } from "@/lib/format";

const USDC_DECIMALS = 6;

/** Auto-derive a vault name + symbol from the borrower name. */
function deriveVaultMeta(borrower: string): { name: string; symbol: string } {
  const trimmed = borrower.trim();
  const name = trimmed ? `${trimmed} Credit Vault` : "Credit Vault";
  const words = trimmed.split(/\s+/).filter(Boolean);
  let core = words.length >= 2 ? words.map((w) => w[0]).join("") : (words[0] ?? "");
  core = core.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4);
  return { name, symbol: `AC${core || "LOAN"}` };
}

export default function AdminPage() {
  const { address: account } = useAccount();
  const [tab, setTab] = useState<"create" | "manage">("create");
  const [highlightVault, setHighlightVault] = useState<Address | null>(null);

  return (
    <div className="mx-auto max-w-content px-6 py-10 lg:px-12">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>

        <div className="mt-4">
          <ConfigBanner />
        </div>

        <div className="mt-4 flex gap-1 border-b border-line">
          <TabButton active={tab === "create"} onClick={() => setTab("create")}>
            Create loan
          </TabButton>
          <TabButton active={tab === "manage"} onClick={() => setTab("manage")}>
            Manage Loans
          </TabButton>
        </div>
      </div>

      <div className={`mt-6 ${tab === "manage" ? "max-w-6xl" : "max-w-3xl"}`}>
        {tab === "create" ? (
          <CreateLoan
            account={account}
            onCreated={(vault) => {
              setHighlightVault(vault ?? null);
              setTab("manage");
            }}
          />
        ) : (
          <ManageLoans highlight={highlightVault} />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm ${
        active ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

// --------------------------------------------------------------------------------------------
// Create loan — 3-step wizard with multi-stage submit
// --------------------------------------------------------------------------------------------

type StepStatus = "idle" | "pending" | "success" | "failed";

function CreateLoan({ account, onCreated }: { account?: Address; onCreated: (vault: Address | null) => void }) {
  const writeContract = useWriteContract();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [poolType, setPoolType] = useState<"simple" | "tranched">("simple");

  // ---- factory owner gate
  const { data: factoryOwner, isLoading: ownerLoading, error: ownerError } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "owner",
    chainId: CHAIN_ID,
    // owner() basically never changes — cache it forever so we don't refetch on every render.
    query: { enabled: Boolean(FACTORY_ADDRESS), staleTime: Infinity, gcTime: Infinity, retry: 2 },
  });
  const isAdmin = account && factoryOwner && account.toLowerCase() === (factoryOwner as string).toLowerCase();
  const ownerKnown = Boolean(factoryOwner);

  // ---- whitelisted deposit assets (read from factory) + their token symbols
  const { data: assetList, refetch: refetchAssets } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "whitelistedAssets",
    chainId: CHAIN_ID,
    query: { enabled: Boolean(FACTORY_ADDRESS), refetchInterval: 30000 },
  });
  const assets = useMemo(() => (assetList as Address[] | undefined) ?? [], [assetList]);

  const { data: symbolData } = useReadContracts({
    allowFailure: true,
    contracts: assets.map(
      (a) => ({ address: a, abi: erc20Abi, functionName: "symbol", chainId: CHAIN_ID } as const),
    ),
    query: { enabled: assets.length > 0 },
  });
  const assetOptions = assets.map((addr, i) => {
    const s = symbolData?.[i];
    const sym = s && s.status === "success" ? (s.result as string) : "ERC20";
    return { addr, sym };
  });

  // ---- form state
  const [form, setForm] = useState({
    borrower: "AgriCo Senegal",
    description: "",
    principal: "50000",
    interestRatePct: "15",
    termDays: "90",
    repaymentType: "1", // 0 bullet, 1 IThenP, 2 amortizing
    installments: "3",
    firstInstallmentAmount: "",
    firstDueDate: "",
    risk: "1", // 0 Low, 1 Medium, 2 High
    asset: "" as string, // selected from assetOptions
    allocator: "",
    customName: "",
    customSymbol: "",
    whitelistEnabled: false,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setArea = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Auto-fill `asset` once the list resolves (pick the first whitelisted token).
  useEffect(() => {
    if (assetOptions.length > 0 && !form.asset) {
      setForm((f) => ({ ...f, asset: assetOptions[0].addr }));
    }
  }, [assetOptions, form.asset]);

  // Prefill allocator with the connected account whenever it changes (unless the user overrode it).
  const lastAccountRef = useRef<Address | undefined>(undefined);
  useEffect(() => {
    if (!account) return;
    if (form.allocator === "" || form.allocator === lastAccountRef.current) {
      setForm((f) => ({ ...f, allocator: account }));
    }
    lastAccountRef.current = account;
  }, [account, form.allocator]);

  const isPeriodic = form.repaymentType !== "0";
  const meta = deriveVaultMeta(form.borrower);
  const effectiveName = form.customName.trim() || meta.name;
  const effectiveSymbol = form.customSymbol.trim() || meta.symbol;
  const allocator = form.allocator || account || "";

  const computedBulletAmount = useMemo(() => {
    const p = Number(form.principal || "0");
    const r = Number(form.interestRatePct || "0") / 100;
    return p > 0 ? parseUnits((p * (1 + r)).toFixed(6) as `${number}`, USDC_DECIMALS) : 0n;
  }, [form.principal, form.interestRatePct]);

  const firstInstallmentWei = isPeriodic
    ? form.firstInstallmentAmount
      ? parseUnits(form.firstInstallmentAmount as `${number}`, USDC_DECIMALS)
      : 0n
    : computedBulletAmount;

  const firstDueDateTs = form.firstDueDate
    ? BigInt(Math.floor(new Date(form.firstDueDate).getTime() / 1000))
    : 0n;

  // ---- dossier files (uploaded at submit time, not before)
  const [files, setFiles] = useState<File[]>([]);

  // ---- validation
  const step1Valid =
    Boolean(form.borrower) &&
    Boolean(form.description.trim()) &&
    Number(form.principal) > 0 &&
    (!isPeriodic || Number(form.installments) > 0) &&
    (isPeriodic ? firstInstallmentWei > 0n : true) &&
    firstDueDateTs > 0n &&
    files.length > 0;
  const step2Valid = isAddress(allocator) && isAddress(form.asset);
  const finalValid = step1Valid && step2Valid;

  // ---- multi-step submit flow state
  const [flow, setFlow] = useState<{
    uploadStatus: StepStatus;
    txStatus: StepStatus;
    dossierURI: string;
    txHash: string;
    vaultAddress: string;
    error: string;
  }>({
    uploadStatus: "idle",
    txStatus: "idle",
    dossierURI: "",
    txHash: "",
    vaultAddress: "",
    error: "",
  });

  const running = flow.uploadStatus === "pending" || flow.txStatus === "pending";
  const finished = flow.txStatus === "success";
  const failed = flow.uploadStatus === "failed" || flow.txStatus === "failed";

  async function runFlow() {
    if (!finalValid || !account) return;
    setFlow((f) => ({ ...f, error: "" }));

    // STEP 1 — Pin dossier to IPFS (skip if already done in a previous run)
    let dossierURI = flow.dossierURI;
    if (flow.uploadStatus !== "success") {
      setFlow((f) => ({ ...f, uploadStatus: "pending" }));
      try {
        const fd = new FormData();
        files.forEach((file) => fd.append("files", file));
        const res = await fetch("/api/ipfs", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        dossierURI = data.uri;
        setFlow((f) => ({ ...f, uploadStatus: "success", dossierURI }));
      } catch (e) {
        setFlow((f) => ({
          ...f,
          uploadStatus: "failed",
          error: e instanceof Error ? e.message : "Dossier upload failed",
        }));
        return;
      }
    }

    // STEP 2 — Send the createLoanVault transaction
    setFlow((f) => ({ ...f, txStatus: "pending" }));
    try {
      const principalWei = parseUnits(form.principal as `${number}`, USDC_DECIMALS);
      const loanParams = {
        borrowerRef: keccak256(toBytes(form.borrower)),
        principal: principalWei,
        rateBps: BigInt(Math.round(Number(form.interestRatePct || "0") * 100)),
        termDays: Number(form.termDays || "0"),
        repaymentType: Number(form.repaymentType),
        installments: isPeriodic ? Number(form.installments || "0") : 0,
        risk: Number(form.risk),
        agreementHash: keccak256(toBytes(dossierURI)),
        dossierURI,
        description: form.description.trim(),
        nextInstallmentAmount: firstInstallmentWei,
        nextDueDate: firstDueDateTs,
      } as const;
      const vaultParams = {
        asset: form.asset as Address,
        admin: account,
        allocator: allocator as Address,
        name: effectiveName,
        symbol: effectiveSymbol,
        maxDeposits: principalWei,
        lzEndpoint: LZ_ENDPOINT,
        tranched: poolType === "tranched",
        whitelistEnabled: form.whitelistEnabled,
      } as const;

      const hash = await writeContract.writeContractAsync({
        address: FACTORY_ADDRESS!,
        abi: factoryAbi,
        functionName: "createLoanVault",
        args: [loanParams, vaultParams],
      });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      // Decode the new vault address from the `VaultCreated(address indexed vault, ...)` log.
      // The vault is the first indexed topic on the factory's event.
      let newVault: Address | null = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === FACTORY_ADDRESS!.toLowerCase() && log.topics.length >= 2) {
          // topic[1] is the indexed vault address
          newVault = (`0x${log.topics[1]!.slice(26)}`) as Address;
          break;
        }
      }
      setFlow((f) => ({
        ...f,
        txStatus: "success",
        txHash: hash,
        vaultAddress: newVault ?? "",
      }));
    } catch (e) {
      setFlow((f) => ({
        ...f,
        txStatus: "failed",
        error: e instanceof Error ? e.message.split("\n")[0] : "Transaction failed",
      }));
    }
  }

  return (
    <div className="max-w-2xl">
      {FACTORY_ADDRESS && account && ownerError && (
        <div className="card mb-6 border-negative/30 p-4 text-sm text-negative">
          Couldn&apos;t verify the factory owner over RPC ({ownerError.message.split("\n")[0]}). The factory may be on a
          different chain than your wallet — switch to Base Sepolia.
        </div>
      )}
      {FACTORY_ADDRESS && account && ownerKnown && !isAdmin && (
        <div className="card mb-6 border-ink/20 p-4 text-sm">
          Connected wallet is not the factory owner ({shortAddr(factoryOwner as string)}). Only the owner can create
          vaults; the transaction will revert otherwise.
        </div>
      )}
      {FACTORY_ADDRESS && account && ownerLoading && !ownerKnown && (
        <div className="card mb-6 p-4 text-sm text-muted">Verifying factory owner over RPC…</div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
        <span className={step === 0 ? "font-medium text-ink" : "text-muted"}>1 · Pool type</span>
        <span className="text-muted">→</span>
        <span className={step === 1 ? "font-medium text-ink" : "text-muted"}>2 · Loan structuration</span>
        <span className="text-muted">→</span>
        <span className={step === 2 ? "font-medium text-ink" : "text-muted"}>3 · Vault config</span>
      </div>

      {step === 0 ? (
        <div className="card p-6">
          <div className="text-sm font-medium">Choose the capital structure</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <PoolCard
              active={poolType === "simple"}
              onClick={() => setPoolType("simple")}
              title="Simple pool"
              desc="One class of LP shares. Everyone shares gains and losses pro-rata (pari passu)."
            />
            <PoolCard
              active={poolType === "tranched"}
              onClick={() => setPoolType("tranched")}
              title="Tranched (first-loss buffer)"
              desc="Senior LP pool protected by a junior first-loss buffer you deposit. Juniors absorb losses first."
            />
          </div>
          <button className="btn btn-primary mt-5 w-full" onClick={() => setStep(1)}>
            Continue →
          </button>
        </div>
      ) : (
        <div className="card p-6">
          {step === 1 ? (
            <>
              <div className="text-sm font-medium">Loan structuration</div>
              <div className="mt-3 space-y-4">
                <Text label="Borrower" placeholder="e.g. AgriCo Senegal" value={form.borrower} onChange={set("borrower")} />
                <div>
                  <label className="label">Description</label>
                  <textarea
                    className="input min-h-[88px]"
                    placeholder="Short summary of the borrower, use of proceeds, and any relevant context."
                    value={form.description}
                    onChange={setArea("description")}
                  />
                  <p className="mt-1 text-xs text-muted">Stored on-chain in the loan NFT — visible to LPs.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Text label="Principal (USDC)" value={form.principal} onChange={set("principal")} />
                  <Text label="Interest rate (% flat)" value={form.interestRatePct} onChange={set("interestRatePct")} />
                  <Text label="Loan term (days)" value={form.termDays} onChange={set("termDays")} />
                </div>

                <div>
                  <label className="label">Repayment type</label>
                  <div className="space-y-2">
                    <RadioRow
                      checked={form.repaymentType === "0"}
                      onChange={() => setForm((f) => ({ ...f, repaymentType: "0" }))}
                      title="Bullet"
                      desc="Principal + interest paid in a single payment at maturity."
                    />
                    <RadioRow
                      checked={form.repaymentType === "1"}
                      onChange={() => setForm((f) => ({ ...f, repaymentType: "1" }))}
                      title="Interest periodic, principal at maturity"
                      desc="Borrower pays the interest in installments and returns the principal at maturity."
                    />
                    <RadioRow
                      checked={form.repaymentType === "2"}
                      onChange={() => setForm((f) => ({ ...f, repaymentType: "2" }))}
                      title="Amortizing"
                      desc="Each installment covers a slice of principal + interest."
                    />
                  </div>
                </div>

                {isPeriodic && (
                  <Text label="Number of installments" value={form.installments} onChange={set("installments")} />
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {isPeriodic ? (
                    <Text
                      label="First installment amount (USDC)"
                      placeholder="e.g. 250"
                      value={form.firstInstallmentAmount}
                      onChange={set("firstInstallmentAmount")}
                    />
                  ) : (
                    <div>
                      <label className="label">First (bullet) repayment (USDC)</label>
                      <input
                        className="input bg-ink/[0.03] text-muted"
                        value={`${(Number(form.principal || 0) * (1 + Number(form.interestRatePct || 0) / 100)).toLocaleString()} (auto-computed)`}
                        readOnly
                      />
                    </div>
                  )}
                  <div>
                    <label className="label">{isPeriodic ? "First" : "Maturity"} due date</label>
                    <input
                      className="input"
                      type="datetime-local"
                      value={form.firstDueDate}
                      onChange={(e) => setForm((f) => ({ ...f, firstDueDate: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label">Risk</label>
                    <select
                      className="input w-full"
                      value={form.risk}
                      onChange={(e) => setForm((f) => ({ ...f, risk: e.target.value }))}
                    >
                      <option value="0">Low</option>
                      <option value="1">Medium</option>
                      <option value="2">High</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label className="label">Dossier files (scans, PDFs)</label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,image/*"
                  className="text-sm"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
                <p className="mt-1 text-xs text-muted">
                  {files.length > 0
                    ? `${files.length} file(s) selected — will be pinned to IPFS when you submit.`
                    : "Required. Pinned to IPFS at submit time."}
                </p>
              </div>

              <div className="mt-5 flex gap-2">
                <button className="btn" onClick={() => setStep(0)}>
                  ← Pool type
                </button>
                <button className="btn btn-primary flex-1" disabled={!step1Valid} onClick={() => setStep(2)}>
                  Next → Vault config
                </button>
              </div>
              {!step1Valid && (
                <p className="mt-2 text-center text-xs text-muted">
                  Fill the loan details and attach the dossier to continue.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="text-sm font-medium">Vault config</div>

              <div className="mt-3 space-y-4">
                {/* Deposit asset */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="label !mb-0">Deposit asset</label>
                    <WhitelistAssetLink onWhitelisted={() => refetchAssets()} disabled={!isAdmin} />
                  </div>
                  <select
                    className="input mt-1 w-full"
                    value={form.asset}
                    onChange={(e) => setForm((f) => ({ ...f, asset: e.target.value }))}
                  >
                    {assetOptions.length === 0 && <option value="">No whitelisted assets — add one</option>}
                    {assetOptions.map((a) => (
                      <option key={a.addr} value={a.addr}>
                        {a.sym} · {shortAddr(a.addr)}
                      </option>
                    ))}
                  </select>
                </div>

                <Text
                  label="Allocator address"
                  mono
                  placeholder={account ?? "0x…"}
                  value={form.allocator}
                  onChange={set("allocator")}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Text label="Vault name" value={form.customName || meta.name} onChange={set("customName")} />
                  <Text label="Symbol" value={form.customSymbol || meta.symbol} onChange={set("customSymbol")} />
                </div>

                <div>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-accent"
                      checked={form.whitelistEnabled}
                      onChange={(e) => setForm((f) => ({ ...f, whitelistEnabled: e.target.checked }))}
                    />
                    <span>
                      <span className="font-medium text-ink">Whitelist depositors</span>
                      <span className="block text-xs text-muted">
                        Only addresses you whitelist (managed from the Manage Loans tab) can deposit. Useful for KYC&apos;d
                        or accredited-LP vaults.
                      </span>
                    </span>
                  </label>
                </div>

                <p className="text-xs text-muted">
                  The loan NFT is minted to you (the admin); you control the vault by holding it. Deposit cap = principal
                  ({Number(form.principal || "0").toLocaleString()} {assetOptions.find((a) => a.addr === form.asset)?.sym ?? "USDC"}).
                  {poolType === "tranched" && (
                    <>
                      {" "}
                      <span className="text-ink">Tranched:</span> you&apos;ll deposit the first-loss buffer on the
                      vault page during funding.
                    </>
                  )}
                </p>
              </div>

              {/* Status strip — appears during/after the submit flow */}
              {(running || finished || failed) && (
                <StatusStrip
                  uploadStatus={flow.uploadStatus}
                  txStatus={flow.txStatus}
                  txHash={flow.txHash}
                  vaultAddress={flow.vaultAddress}
                  error={flow.error}
                  onRetry={runFlow}
                  onManage={() => onCreated((flow.vaultAddress as Address) || null)}
                />
              )}

              <div className="mt-5 flex gap-2">
                <button className="btn" onClick={() => setStep(1)} disabled={running}>
                  ← Back
                </button>
                {!finished && (
                  <button
                    className="btn btn-primary flex-1"
                    disabled={!finalValid || running || !account}
                    onClick={runFlow}
                  >
                    {running ? "Working…" : failed ? "Resume" : "Create loan + vault"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// Status strip — shows IPFS upload + tx steps, retry on failure, manage CTA on success
// --------------------------------------------------------------------------------------------

function StatusStrip({
  uploadStatus,
  txStatus,
  txHash,
  vaultAddress,
  error,
  onRetry,
  onManage,
}: {
  uploadStatus: StepStatus;
  txStatus: StepStatus;
  txHash: string;
  vaultAddress: string;
  error: string;
  onRetry: () => void;
  onManage: () => void;
}) {
  const done = txStatus === "success";
  return (
    <div className="mt-6 rounded-md border border-line bg-bg2/60 p-4">
      <div className="eyebrow !text-[10px]">// Submission</div>
      <div className="mt-3 space-y-2">
        <StatusRow
          n={1}
          title="Pin dossier to IPFS"
          status={uploadStatus}
          detail={uploadStatus === "success" ? "Pinned" : uploadStatus === "pending" ? "Uploading…" : undefined}
        />
        <StatusRow
          n={2}
          title="Send createLoanVault transaction"
          status={txStatus}
          detail={
            txStatus === "success"
              ? "Confirmed"
              : txStatus === "pending"
                ? "Waiting for confirmation…"
                : undefined
          }
        />
      </div>

      {error && (
        <p className="mt-3 break-words rounded border border-negative/30 bg-negative/[0.06] p-2 text-[11px] text-negative">
          {error}
        </p>
      )}

      {done ? (
        <div className="mt-4 rounded-md border border-positive/30 bg-positive/[0.06] p-3">
          <div className="text-sm font-medium text-positive">Loan + vault created successfully</div>
          {(txHash || vaultAddress) && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
              {txHash && (
                <a
                  className="link-accent"
                  href={`${EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View tx ↗
                </a>
              )}
              {vaultAddress && (
                <a
                  className="link-accent"
                  href={`${EXPLORER}/address/${vaultAddress}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View vault ↗
                </a>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onManage}
            className="btn-accent mt-3 inline-flex h-8 items-center rounded-sm px-4 text-[12px] font-medium"
          >
            Manage loan →
          </button>
        </div>
      ) : (
        (uploadStatus === "failed" || txStatus === "failed") && (
          <button
            type="button"
            onClick={onRetry}
            className="btn-primary mt-3 inline-flex h-8 items-center rounded-sm px-4 text-[12px] font-medium"
          >
            Retry
          </button>
        )
      )}
    </div>
  );
}

function StatusRow({
  n,
  title,
  status,
  detail,
}: {
  n: number;
  title: string;
  status: StepStatus;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <StepDot n={n} status={status} />
      <div className="flex flex-1 items-center justify-between gap-2 text-[13px]">
        <span className={status === "failed" ? "text-negative" : "text-ink"}>{title}</span>
        {detail && (
          <span className={`text-[11px] ${status === "success" ? "text-positive" : "text-ink2"}`}>{detail}</span>
        )}
      </div>
    </div>
  );
}

function StepDot({ n, status }: { n: number; status: StepStatus }) {
  if (status === "success") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-positive">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3 w-3 text-bg">
          <path d="M2.5 6.5L5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    );
  }
  if (status === "failed") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-negative">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 text-bg">
          <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  // idle
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rule2 text-[10px] text-ink2">
      {n}
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// Whitelist asset link + inline form
// --------------------------------------------------------------------------------------------

function WhitelistAssetLink({ onWhitelisted, disabled }: { onWhitelisted: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const writeContract = useWriteContract();

  const valid = isAddress(addr);

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const hash = await writeContract.writeContractAsync({
        address: FACTORY_ADDRESS!,
        abi: factoryAbi,
        functionName: "whitelistAsset",
        args: [addr as Address],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      onWhitelisted();
      setAddr("");
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split("\n")[0] : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="text-[11px] text-accent transition-colors hover:text-accent2 disabled:opacity-40"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        {open ? "− Cancel" : "+ Whitelist an address"}
      </button>
      {open && (
        <div className="mt-2 w-full rounded border border-line bg-bg2/60 p-3">
          <label className="label">Token address</label>
          <div className="flex gap-2">
            <input
              className="input font-mono text-[12px]"
              placeholder="0x…"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary inline-flex h-9 items-center rounded-sm px-3 text-[12px] font-medium"
              disabled={!valid || busy}
              onClick={submit}
            >
              {busy ? "…" : "Add"}
            </button>
          </div>
          {err && <p className="mt-2 break-words text-[11px] text-negative">{err}</p>}
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------------------------------------
// Pool type radio card
// --------------------------------------------------------------------------------------------

function PoolCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`card p-4 text-left transition-colors ${active ? "border-ink ring-1 ring-ink" : "hover:border-ink/30"}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full border ${active ? "border-ink" : "border-line"}`}
        >
          {active && <span className="h-2 w-2 rounded-full bg-ink" />}
        </span>
        <span className="font-medium">{title}</span>
      </div>
      <p className="mt-2 text-xs text-muted">{desc}</p>
    </button>
  );
}

// --------------------------------------------------------------------------------------------
// Repayment-type radio row (large clickable rows with title + description)
// --------------------------------------------------------------------------------------------

function RadioRow({
  checked,
  onChange,
  title,
  desc,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  desc: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
        checked ? "border-accent bg-accent/[0.04]" : "border-line hover:border-rule2"
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 accent-accent"
      />
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{title}</div>
        <div className="mt-0.5 text-[11px] text-muted">{desc}</div>
      </div>
    </label>
  );
}

// --------------------------------------------------------------------------------------------
// Manage Loans tab
// --------------------------------------------------------------------------------------------

function ManageLoans({ highlight }: { highlight: Address | null }) {
  const { data: vaults, isLoading } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "allVaults",
    query: { enabled: Boolean(FACTORY_ADDRESS), refetchInterval: 30000 },
  });
  const list = (vaults as Address[] | undefined) ?? [];

  if (!FACTORY_ADDRESS) return <p className="text-sm text-muted">Configure the factory address first.</p>;
  if (isLoading) return <p className="text-sm text-muted">Loading vaults…</p>;
  if (list.length === 0)
    return <div className="card p-8 text-center text-sm text-muted">No vaults yet. Create one from the Create loan tab.</div>;

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Expand a vault with Manage to control its lifecycle, custody, and loan servicing.
      </p>
      <div className="grid grid-cols-1 gap-4">
        {list.map((v) => (
          <VaultCard
            key={v}
            address={v}
            manageable
            wide
            highlight={highlight?.toLowerCase() === v.toLowerCase()}
          />
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// Shared <Text /> input
// --------------------------------------------------------------------------------------------

function Text({
  label,
  value,
  onChange,
  placeholder,
  mono,
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className={`input ${mono ? "font-mono" : ""} ${disabled ? "bg-ink/[0.03] text-muted" : ""}`}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        disabled={disabled}
        readOnly={disabled}
      />
    </div>
  );
}
