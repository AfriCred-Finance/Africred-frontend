"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseUnits, isAddress, type Address } from "viem";
import { factoryAbi } from "@/lib/abis";
import { FACTORY_ADDRESS, USDC_ADDRESS, LZ_ENDPOINT } from "@/lib/contracts";
import { useAction } from "@/lib/useAction";
import { ConfigBanner } from "@/components/ConfigBanner";
import { shortAddr } from "@/lib/format";

const USDC_DECIMALS = 6;

export default function AdminPage() {
  const { address: account } = useAccount();
  const create = useAction();

  const { data: factoryOwner } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "owner",
    query: { enabled: Boolean(FACTORY_ADDRESS) },
  });

  const isAdmin = account && factoryOwner && account.toLowerCase() === (factoryOwner as string).toLowerCase();

  const [form, setForm] = useState({
    name: "AfriCred SME Vault",
    symbol: "afSME",
    allocator: "",
    maxDeposits: "100000",
    performanceFeeBps: "2000",
    managementFeeBps: "200",
    loanTermDays: "90",
    interestRatePct: "15",
    repaymentType: "0", // 0 = at maturity, 1 = periodic
    paymentIntervalDays: "30",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const isPeriodic = form.repaymentType === "1";

  const valid =
    isAddress(form.allocator) &&
    form.name &&
    form.symbol &&
    USDC_ADDRESS &&
    (!isPeriodic || Number(form.paymentIntervalDays) > 0);

  const submit = () => {
    if (!valid || !account) return;
    const params = {
      asset: USDC_ADDRESS as Address,
      admin: account,
      allocator: form.allocator as Address,
      name: form.name,
      symbol: form.symbol,
      maxDeposits: parseUnits(form.maxDeposits as `${number}`, USDC_DECIMALS),
      lzEndpoint: LZ_ENDPOINT,
      feeRecipient: account,
      performanceFeeBps: BigInt(form.performanceFeeBps || "0"),
      managementFeeBps: BigInt(form.managementFeeBps || "0"),
      loanTermDays: BigInt(form.loanTermDays || "0"),
      targetAprBps: BigInt(Math.round(Number(form.interestRatePct || "0") * 100)),
      repaymentType: Number(form.repaymentType),
      paymentIntervalDays: isPeriodic ? BigInt(form.paymentIntervalDays || "0") : 0n,
    } as const;
    create.run({ address: FACTORY_ADDRESS!, abi: factoryAbi, functionName: "createVault", args: [params] });
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>

      <div className="mt-6">
        <ConfigBanner />
      </div>

      {FACTORY_ADDRESS && account && !isAdmin && (
        <div className="card mb-6 border-ink/20 p-4 text-sm">
          Connected wallet is not the factory owner ({shortAddr(factoryOwner as string)}). Only the owner can create
          vaults; the transaction will revert otherwise.
        </div>
      )}

      <div className="card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Vault name" value={form.name} onChange={set("name")} />
          <Text label="Share symbol" value={form.symbol} onChange={set("symbol")} />
          <div className="sm:col-span-2">
            <Text label="Allocator address" mono placeholder="0x…" value={form.allocator} onChange={set("allocator")} />
          </div>
          <Text label="Deposit cap (USDC)" value={form.maxDeposits} onChange={set("maxDeposits")} />
          <div />
          <Text label="Loan term (days)" value={form.loanTermDays} onChange={set("loanTermDays")} />
          <Text label="Interest rate (% APR)" value={form.interestRatePct} onChange={set("interestRatePct")} />
          <Text label="Performance fee (bps)" value={form.performanceFeeBps} onChange={set("performanceFeeBps")} />
          <Text label="Management fee (bps)" value={form.managementFeeBps} onChange={set("managementFeeBps")} />
          <div>
            <label className="label">Repayment schedule</label>
            <select
              className="input"
              value={form.repaymentType}
              onChange={(e) => setForm((f) => ({ ...f, repaymentType: e.target.value }))}
            >
              <option value="0">At maturity</option>
              <option value="1">Periodic instalments</option>
            </select>
          </div>
          {isPeriodic && (
            <Text
              label="Payment interval (days)"
              value={form.paymentIntervalDays}
              onChange={set("paymentIntervalDays")}
            />
          )}
        </div>

        <div className="mt-5 rounded-lg bg-ink/[0.03] p-3 text-xs text-muted">
          Asset: <span className="font-mono">{USDC_ADDRESS ? shortAddr(USDC_ADDRESS) : "—"}</span> · LZ endpoint:{" "}
          <span className="font-mono">{shortAddr(LZ_ENDPOINT)}</span> · 100 bps = 1%
        </div>

        <button className="btn btn-primary mt-5 w-full" disabled={!valid || create.pending || !account} onClick={submit}>
          {create.pending ? "Deploying…" : "Deploy vault"}
        </button>
        {create.error && <p className="mt-2 break-words text-xs text-red-700/80">{create.error}</p>}
      </div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className={`input ${mono ? "font-mono" : ""}`} value={value} placeholder={placeholder} onChange={onChange} />
    </div>
  );
}
