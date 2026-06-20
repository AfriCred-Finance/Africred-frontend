"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const STEPS = ["Vault Type", "Loan terms", "Vault config"] as const;
type Step = 0 | 1 | 2;

export default function AdminPage() {
  const { address: account } = useAccount();
  const [view, setView] = useState<"create" | "manage">("create");
  const [step, setStep] = useState<Step>(0);
  const [highlightVault, setHighlightVault] = useState<Address | null>(null);

  return (
    <div className="mx-auto max-w-content px-6 py-10 lg:px-12">
      <PageHeader
        title="Admin"
        description={
          view === "create"
            ? "Configure credit vaults, set loan terms, and deploy on-chain instances LPs can fund."
            : "Manage the loan vaults you have deployed: lifecycle, custody, repayments."
        }
        right={<ViewTabs view={view} onChange={setView} />}
      />

      {view === "create" && (
        <div className="mt-6">
          <Stepper steps={STEPS as unknown as string[]} active={step} onStep={(i) => setStep(i as Step)} />
        </div>
      )}

      <div className="mt-6">
        <ConfigBanner />
      </div>

      <div className="mt-6">
        {view === "create" ? (
          <CreateLoan
            account={account}
            step={step}
            setStep={setStep}
            onCreated={(vault) => {
              setHighlightVault(vault ?? null);
              setView("manage");
            }}
          />
        ) : (
          <ManageLoans highlight={highlightVault} />
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// Page header (title left, stepper + registry link right)
// --------------------------------------------------------------------------------------------

function PageHeader({
  title,
  description,
  right,
}: {
  title: string;
  description: string;
  right: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink2">{description}</p>
      </div>
      <div className="flex flex-col items-end gap-3">{right}</div>
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// View tabs (Create Loan / Manage loan)
// --------------------------------------------------------------------------------------------

function ViewTabs({
  view,
  onChange,
}: {
  view: "create" | "manage";
  onChange: (v: "create" | "manage") => void;
}) {
  const tabs: { key: "create" | "manage"; label: string }[] = [
    { key: "create", label: "Create Loan" },
    { key: "manage", label: "Manage loan" },
  ];
  return (
    <div className="card flex items-stretch overflow-hidden">
      {tabs.map((t) => {
        const isActive = t.key === view;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`relative px-5 py-3 text-sm transition-colors ${
              isActive ? "text-ink" : "text-ink3 hover:text-ink2"
            }`}
          >
            <span className={isActive ? "font-medium" : ""}>{t.label}</span>
            {isActive && <span className="absolute inset-x-3 bottom-0 h-px bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// Stepper (01 / 02 / 03 with accent underline on the active step)
// --------------------------------------------------------------------------------------------

function Stepper({ steps, active, onStep }: { steps: string[]; active: number; onStep: (i: number) => void }) {
  return (
    <div className="card flex items-stretch overflow-hidden">
      {steps.map((label, i) => {
        const isActive = i === active;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onStep(i)}
            className={`relative flex items-center gap-2 px-5 py-3 text-sm transition-colors ${
              isActive ? "text-ink" : "text-ink3 hover:text-ink2"
            }`}
          >
            <span className="font-mono text-[11px] text-ink3">{String(i + 1).padStart(2, "0")}</span>
            <span className={isActive ? "font-medium" : ""}>{label}</span>
            {isActive && <span className="absolute inset-x-3 bottom-0 h-px bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// SectionCard (collapsible card with check circle, title, summary, chevron)
// --------------------------------------------------------------------------------------------

function SectionCard({
  title,
  summary,
  complete,
  defaultOpen = true,
  children,
}: {
  title: string;
  summary?: string;
  complete: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-bg2/60"
      >
        <CheckCircle complete={complete} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink">{title}</div>
          {summary && <div className="mt-0.5 truncate text-xs text-ink2">{summary}</div>}
        </div>
        <Chevron open={open} />
      </button>
      {open && <div className="border-t border-rule px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

function CheckCircle({ complete }: { complete: boolean }) {
  if (complete) {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-positive/15">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 text-positive">
          <path d="M2.5 6.5L5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  return <div className="h-6 w-6 shrink-0 rounded-full border border-rule2" />;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`h-3 w-3 shrink-0 text-ink2 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M2.5 4.5L6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// --------------------------------------------------------------------------------------------
// OptionPill (selectable pill with circle icon + label)
// --------------------------------------------------------------------------------------------

function OptionPill({
  label,
  selected,
  disabled,
  onClick,
  sublabel,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  sublabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        selected
          ? "border-accent text-ink"
          : disabled
            ? "border-rule text-ink3 cursor-not-allowed"
            : "border-rule2 text-ink2 hover:border-ink/40 hover:text-ink"
      }`}
    >
      <PillIcon selected={selected} />
      <span className={selected ? "font-medium" : ""}>{label}</span>
      {sublabel && <span className="font-mono text-[10px] text-ink3">{sublabel}</span>}
    </button>
  );
}

function PillIcon({ selected }: { selected: boolean }) {
  if (selected) {
    return (
      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-accent">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-2.5 w-2.5 text-bg">
          <path d="M2.5 6.5L5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  return <div className="h-4 w-4 shrink-0 rounded-full border border-rule2" />;
}

// --------------------------------------------------------------------------------------------
// Vault type cards (Step 1 strategy picker)
// --------------------------------------------------------------------------------------------

function VaultTypeCard({
  selected,
  onClick,
  title,
  tagline,
  meta,
  tags,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  tagline: string;
  meta: { label: string; value: string }[];
  tags: string[];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card relative w-full p-5 text-left transition-colors ${
        selected ? "border-accent ring-1 ring-accent/40" : "hover:border-ink/30"
      }`}
    >
      <RadioDot selected={selected} className="absolute right-4 top-4" />
      <div className="pr-8">
        <div className="text-base font-medium text-ink">{title}</div>
        <p className="mt-1 text-sm text-ink2">{tagline}</p>
      </div>
      {meta.length > 0 && (
        <div className="mt-4 space-y-1">
          {meta.map((m) => (
            <div key={m.label} className="text-xs">
              <span className="font-mono uppercase tracking-wider text-ink3">{m.label}: </span>
              <span className="text-ink2">{m.value}</span>
            </div>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-rule2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink2"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function RadioDot({ selected, className }: { selected: boolean; className?: string }) {
  if (selected) {
    return (
      <div
        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 border-accent ${className ?? ""}`}
      >
        <div className="h-2 w-2 rounded-full bg-accent" />
      </div>
    );
  }
  return <div className={`h-5 w-5 rounded-full border border-rule2 ${className ?? ""}`} />;
}

// --------------------------------------------------------------------------------------------
// Create loan — wizard with multi-stage submit
// --------------------------------------------------------------------------------------------

type StepStatus = "idle" | "pending" | "success" | "failed";

function CreateLoan({
  account,
  step,
  setStep,
  onCreated,
}: {
  account?: Address;
  step: Step;
  setStep: (s: Step) => void;
  onCreated: (vault: Address | null) => void;
}) {
  const writeContract = useWriteContract();
  const [poolType, setPoolType] = useState<"simple" | "tranched">("simple");

  // ---- factory owner gate
  const { data: factoryOwner, isLoading: ownerLoading, error: ownerError } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "owner",
    chainId: CHAIN_ID,
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
    asset: "" as string,
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

  // Expected first installment derived from principal, flat rate, and installment count.
  const expectedFirstInstallment = useMemo(() => {
    const p = Number(form.principal || "0");
    const r = Number(form.interestRatePct || "0") / 100;
    const n = Number(form.installments || "0");
    if (!isPeriodic || p <= 0 || r < 0 || n <= 0) return 0;
    if (form.repaymentType === "1") return (p * r) / n;
    if (form.repaymentType === "2") return (p * (1 + r)) / n;
    return 0;
  }, [form.principal, form.interestRatePct, form.installments, form.repaymentType, isPeriodic]);

  const firstInstallmentWei = isPeriodic
    ? form.firstInstallmentAmount
      ? parseUnits(form.firstInstallmentAmount as `${number}`, USDC_DECIMALS)
      : 0n
    : computedBulletAmount;

  const installmentMatches = useMemo(() => {
    if (!isPeriodic) return true;
    if (expectedFirstInstallment <= 0) return true;
    const entered = Number(form.firstInstallmentAmount || "0");
    if (entered <= 0) return false;
    return Math.abs(entered - expectedFirstInstallment) <= 0.01;
  }, [isPeriodic, expectedFirstInstallment, form.firstInstallmentAmount]);

  const firstDueDateTs = form.firstDueDate
    ? BigInt(Math.floor(new Date(form.firstDueDate).getTime() / 1000))
    : 0n;

  // ---- dossier files
  const [files, setFiles] = useState<File[]>([]);

  // ---- per-section completion flags (drive the green check in headers)
  const c = {
    pool: true,
    borrower: Boolean(form.borrower && form.description.trim()),
    economics: Number(form.principal) > 0 && Number(form.interestRatePct) >= 0 && Number(form.termDays) > 0,
    repayment:
      (!isPeriodic || Number(form.installments) > 0) &&
      (isPeriodic ? firstInstallmentWei > 0n && installmentMatches : true) &&
      firstDueDateTs > 0n,
    risk: form.risk !== "",
    dossier: files.length > 0,
    asset: isAddress(form.asset),
    allocator: isAddress(allocator),
    branding: Boolean(effectiveName && effectiveSymbol),
    access: true,
  };

  const step1Valid = c.borrower && c.economics && c.repayment && c.risk && c.dossier;
  const step2Valid = c.asset && c.allocator && c.branding;
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

      let newVault: Address | null = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === FACTORY_ADDRESS!.toLowerCase() && log.topics.length >= 2) {
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
    <div className="space-y-4">
      {FACTORY_ADDRESS && account && ownerError && (
        <div className="card border-negative/30 p-4 text-sm text-negative">
          Couldn&apos;t verify the factory owner over RPC ({ownerError.message.split("\n")[0]}). The factory may be on a
          different chain than your wallet. Switch to Base Sepolia.
        </div>
      )}
      {FACTORY_ADDRESS && account && ownerKnown && !isAdmin && (
        <div className="card border-ink/20 p-4 text-sm">
          Connected wallet is not the factory owner ({shortAddr(factoryOwner as string)}). Only the owner can create
          vaults; the transaction will revert otherwise.
        </div>
      )}
      {FACTORY_ADDRESS && account && ownerLoading && !ownerKnown && (
        <div className="card p-4 text-sm text-muted">Verifying factory owner over RPC...</div>
      )}

      {step === 0 && (
        <>
          <div className="grid gap-3">
            <VaultTypeCard
              selected={poolType === "simple"}
              onClick={() => setPoolType("simple")}
              title="Simple pool"
              tagline="USDC deposits to a single LP class. Everyone shares gains and losses pro-rata."
              meta={[
                { label: "Capital structure", value: "Single class" },
                { label: "Loss waterfall", value: "Pari passu (pro-rata)" },
              ]}
              tags={["SIMPLE", "OPEN TO LPS"]}
            />
            <VaultTypeCard
              selected={poolType === "tranched"}
              onClick={() => setPoolType("tranched")}
              title="Tranched (first-loss buffer)"
              tagline="Senior LP pool protected by a junior buffer the admin posts. Juniors absorb losses first."
              meta={[
                { label: "Capital structure", value: "Senior + junior buffer" },
                { label: "Loss waterfall", value: "Junior first, then senior" },
              ]}
              tags={["TRANCHED", "FIRST LOSS", "PROTECTION"]}
            />
          </div>

          <NavRow>
            <span />
            <button className="btn btn-primary" onClick={() => setStep(1)}>
              Continue →
            </button>
          </NavRow>
        </>
      )}

      {step === 1 && (
        <>
          <SectionCard
            title="Borrower"
            summary={form.borrower || "Not set"}
            complete={c.borrower}
          >
            <div className="space-y-4">
              <Text label="Borrower name" placeholder="e.g. AgriCo Senegal" value={form.borrower} onChange={set("borrower")} />
              <div>
                <label className="label">Description</label>
                <textarea
                  className="input min-h-[88px]"
                  placeholder="Short summary of the borrower, use of proceeds, and any relevant context."
                  value={form.description}
                  onChange={setArea("description")}
                />
                <p className="mt-1 text-xs text-muted">Stored on-chain in the loan NFT; visible to LPs.</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Loan economics"
            summary={
              c.economics
                ? `${Number(form.principal).toLocaleString()} principal at ${form.interestRatePct}% over ${form.termDays}d`
                : "Set principal, rate, and term"
            }
            complete={c.economics}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Text label="Principal (USDC)" value={form.principal} onChange={set("principal")} />
              <Text label="Interest rate (% flat)" value={form.interestRatePct} onChange={set("interestRatePct")} />
              <Text label="Loan term (days)" value={form.termDays} onChange={set("termDays")} />
            </div>
          </SectionCard>

          <SectionCard
            title="Repayment"
            summary={
              c.repayment
                ? `${repaymentTypeLabel(form.repaymentType)}${
                    isPeriodic ? ` over ${form.installments} installments` : ""
                  }`
                : "Choose schedule and first payment"
            }
            complete={c.repayment}
          >
            <div className="space-y-4">
              <div>
                <label className="label">Schedule</label>
                <div className="flex flex-wrap gap-2">
                  <OptionPill
                    label="Bullet"
                    selected={form.repaymentType === "0"}
                    onClick={() => setForm((f) => ({ ...f, repaymentType: "0" }))}
                  />
                  <OptionPill
                    label="Interest periodic, principal at maturity"
                    selected={form.repaymentType === "1"}
                    onClick={() => setForm((f) => ({ ...f, repaymentType: "1" }))}
                  />
                  <OptionPill
                    label="Amortizing"
                    selected={form.repaymentType === "2"}
                    onClick={() => setForm((f) => ({ ...f, repaymentType: "2" }))}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">{repaymentTypeDesc(form.repaymentType)}</p>
              </div>

              {isPeriodic && (
                <Text label="Number of installments" value={form.installments} onChange={set("installments")} />
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {isPeriodic ? (
                  <div>
                    <Text
                      label="First installment amount (USDC)"
                      placeholder="e.g. 250"
                      value={form.firstInstallmentAmount}
                      onChange={set("firstInstallmentAmount")}
                    />
                    <InstallmentHint
                      expected={expectedFirstInstallment}
                      entered={form.firstInstallmentAmount}
                      repaymentType={form.repaymentType}
                      matches={installmentMatches}
                      onAutofill={() =>
                        setForm((f) => ({
                          ...f,
                          firstInstallmentAmount: expectedFirstInstallment.toFixed(2),
                        }))
                      }
                    />
                  </div>
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
            </div>
          </SectionCard>

          <SectionCard
            title="Risk"
            summary={riskLabel(form.risk)}
            complete={c.risk}
          >
            <div className="flex flex-wrap gap-2">
              <OptionPill label="Low" selected={form.risk === "0"} onClick={() => setForm((f) => ({ ...f, risk: "0" }))} />
              <OptionPill label="Medium" selected={form.risk === "1"} onClick={() => setForm((f) => ({ ...f, risk: "1" }))} />
              <OptionPill label="High" selected={form.risk === "2"} onClick={() => setForm((f) => ({ ...f, risk: "2" }))} />
            </div>
          </SectionCard>

          <SectionCard
            title="Dossier"
            summary={files.length > 0 ? `${files.length} file(s) ready to pin` : "Attach scans or PDFs"}
            complete={c.dossier}
          >
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,image/*"
              className="text-sm"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <p className="mt-1 text-xs text-muted">
              {files.length > 0
                ? `${files.length} file(s) selected. Pinned to IPFS when you submit.`
                : "Required. Pinned to IPFS at submit time."}
            </p>
          </SectionCard>

          <NavRow>
            <button className="btn" onClick={() => setStep(0)}>
              Back
            </button>
            <button className="btn btn-primary" disabled={!step1Valid} onClick={() => setStep(2)}>
              Next: Vault config
            </button>
          </NavRow>
          {!step1Valid && (
            <p className="text-center text-xs text-muted">
              {isPeriodic && !installmentMatches && Number(form.firstInstallmentAmount || "0") > 0
                ? "First installment doesn't match the flat-rate schedule. Adjust the amount or use Auto-fill above."
                : "Fill the required sections to continue."}
            </p>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <SectionCard
            title="Deposit asset"
            summary={
              c.asset
                ? `${assetOptions.find((a) => a.addr === form.asset)?.sym ?? "?"} ${shortAddr(form.asset)}`
                : "Pick a whitelisted asset"
            }
            complete={c.asset}
          >
            {assetOptions.length === 0 ? (
              <p className="text-sm text-muted">No whitelisted assets. Add one below.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {assetOptions.map((a) => (
                  <OptionPill
                    key={a.addr}
                    label={a.sym}
                    sublabel={shortAddr(a.addr)}
                    selected={form.asset === a.addr}
                    onClick={() => setForm((f) => ({ ...f, asset: a.addr }))}
                  />
                ))}
              </div>
            )}
            <div className="mt-3">
              <WhitelistAssetLink onWhitelisted={() => refetchAssets()} disabled={!isAdmin} />
            </div>
          </SectionCard>

          <SectionCard
            title="Allocator"
            summary={c.allocator ? shortAddr(allocator) : "Set who takes custody"}
            complete={c.allocator}
          >
            <Text
              label="Allocator address"
              mono
              placeholder={account ?? "0x..."}
              value={form.allocator}
              onChange={set("allocator")}
            />
            <p className="mt-1 text-xs text-muted">
              The allocator pulls funds when custody opens and originates the loan off-chain.
            </p>
          </SectionCard>

          <SectionCard
            title="Branding"
            summary={`${effectiveName} (${effectiveSymbol})`}
            complete={c.branding}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Text label="Vault name" value={form.customName || meta.name} onChange={set("customName")} />
              <Text label="Symbol" value={form.customSymbol || meta.symbol} onChange={set("customSymbol")} />
            </div>
          </SectionCard>

          <SectionCard
            title="Access"
            summary={form.whitelistEnabled ? "Whitelist required" : "Open to all depositors"}
            complete
          >
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
                  Only addresses you whitelist (managed from the Manage Loans view) can deposit. Useful for KYC&apos;d or
                  accredited-LP vaults.
                </span>
              </span>
            </label>
          </SectionCard>

          <p className="px-1 text-xs text-muted">
            The loan NFT is minted to you (the admin); you control the vault by holding it. Deposit cap = principal (
            {Number(form.principal || "0").toLocaleString()}{" "}
            {assetOptions.find((a) => a.addr === form.asset)?.sym ?? "USDC"}).
            {poolType === "tranched" && (
              <>
                {" "}
                <span className="text-ink">Tranched:</span> you&apos;ll deposit the first-loss buffer on the vault page
                during funding.
              </>
            )}
          </p>

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

          <NavRow>
            <button className="btn" onClick={() => setStep(1)} disabled={running}>
              Back
            </button>
            {!finished && (
              <button
                className="btn btn-primary"
                disabled={!finalValid || running || !account}
                onClick={runFlow}
              >
                {running ? "Working..." : failed ? "Resume" : "Create loan + vault"}
              </button>
            )}
          </NavRow>
        </>
      )}
    </div>
  );
}

function NavRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between">{children}</div>;
}

function repaymentTypeLabel(t: string) {
  if (t === "0") return "Bullet";
  if (t === "1") return "Interest periodic, principal at maturity";
  if (t === "2") return "Amortizing";
  return "";
}

function repaymentTypeDesc(t: string) {
  if (t === "0") return "Principal + interest paid in a single payment at maturity.";
  if (t === "1") return "Borrower pays the interest in installments and returns the principal at maturity.";
  if (t === "2") return "Each installment covers a slice of principal + interest.";
  return "";
}

function riskLabel(r: string) {
  if (r === "0") return "Low";
  if (r === "1") return "Medium";
  if (r === "2") return "High";
  return "Not set";
}

// --------------------------------------------------------------------------------------------
// Status strip (IPFS upload + tx steps, retry on failure, manage CTA on success)
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
    <div className="card border-line bg-bg2/60 p-4">
      <div className="eyebrow !text-[10px]">// Submission</div>
      <div className="mt-3 space-y-2">
        <StatusRow
          n={1}
          title="Pin dossier to IPFS"
          status={uploadStatus}
          detail={uploadStatus === "success" ? "Pinned" : uploadStatus === "pending" ? "Uploading..." : undefined}
        />
        <StatusRow
          n={2}
          title="Send createLoanVault transaction"
          status={txStatus}
          detail={
            txStatus === "success"
              ? "Confirmed"
              : txStatus === "pending"
                ? "Waiting for confirmation..."
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
                <a className="link-accent" href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer">
                  View tx
                </a>
              )}
              {vaultAddress && (
                <a className="link-accent" href={`${EXPLORER}/address/${vaultAddress}`} target="_blank" rel="noreferrer">
                  View vault
                </a>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onManage}
            className="btn-accent mt-3 inline-flex h-8 items-center rounded-sm px-4 text-[12px] font-medium"
          >
            Manage loan
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
        className="text-[11px] text-accent transition-colors hover:text-accent2 disabled:cursor-not-allowed disabled:text-ink3"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        {open ? "Cancel" : "+ Whitelist an asset"}
      </button>
      {open && (
        <div className="mt-2 w-full rounded border border-line bg-bg2/60 p-3">
          <label className="label">Token address</label>
          <div className="flex gap-2">
            <input
              className="input font-mono text-[12px]"
              placeholder="0x..."
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary inline-flex h-9 items-center rounded-sm px-3 text-[12px] font-medium"
              disabled={!valid || busy}
              onClick={submit}
            >
              {busy ? "..." : "Add"}
            </button>
          </div>
          {err && <p className="mt-2 break-words text-[11px] text-negative">{err}</p>}
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------------------------------------
// Manage Loans
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
  if (isLoading) return <p className="text-sm text-muted">Loading vaults...</p>;
  if (list.length === 0)
    return (
      <div className="card p-8 text-center text-sm text-muted">
        No vaults yet. Switch to Create Loan to deploy one.
      </div>
    );

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
// Installment math hint
// --------------------------------------------------------------------------------------------

function InstallmentHint({
  expected,
  entered,
  repaymentType,
  matches,
  onAutofill,
}: {
  expected: number;
  entered: string;
  repaymentType: string;
  matches: boolean;
  onAutofill: () => void;
}) {
  if (expected <= 0) {
    return (
      <p className="mt-1 text-xs text-muted">
        Set principal, rate, and number of installments to see the expected amount.
      </p>
    );
  }
  const formula =
    repaymentType === "1"
      ? "principal x rate / installments"
      : "principal x (1 + rate) / installments";
  const enteredNum = Number(entered || "0");
  if (enteredNum <= 0) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span>
          Expected: <span className="font-medium text-ink">{expected.toFixed(2)} USDC</span> ({formula})
        </span>
        <button
          type="button"
          onClick={onAutofill}
          className="text-accent transition-colors hover:text-accent2"
        >
          Auto-fill
        </button>
      </p>
    );
  }
  if (matches) {
    return (
      <p className="mt-1 text-xs text-positive">
        Matches the flat-rate schedule ({expected.toFixed(2)} USDC per installment).
      </p>
    );
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-negative">
      <span>
        Expected {expected.toFixed(2)} USDC ({formula}). You entered {enteredNum.toFixed(2)}.
      </span>
      <button
        type="button"
        onClick={onAutofill}
        className="text-accent transition-colors hover:text-accent2"
      >
        Auto-fill
      </button>
    </p>
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
