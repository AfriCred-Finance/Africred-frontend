"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContracts } from "wagmi";
import { parseUnits, type Address, isAddress } from "viem";
import { useVault } from "@/lib/useVault";
import { useAction } from "@/lib/useAction";
import { erc20Abi, vaultAbi } from "@/lib/abis";
import { EXPLORER } from "@/lib/contracts";
import { fmtUnits, fmtDate, phaseLabel, shortAddr } from "@/lib/format";
import { Stat, PhaseBadge } from "@/components/Stat";

export default function VaultPage() {
  const params = useParams();
  const address = (params.address as string)?.toLowerCase() as Address;
  const { address: account } = useAccount();
  const { vault, refetch } = useVault(isAddress(address) ? address : undefined, account);

  if (!isAddress(address)) return <p className="text-sm text-muted">Invalid vault address.</p>;
  if (!vault) return <p className="text-sm text-muted">Loading vault…</p>;

  const isAllocator = account && account.toLowerCase() === vault.allocator.toLowerCase();
  const isOwner = account && account.toLowerCase() === vault.owner.toLowerCase();
  const positionValue = (vault.shareBalance * vault.totalAssets) / (vault.totalSupply === 0n ? 1n : vault.totalSupply);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{vault.name}</h1>
            <PhaseBadge phase={phaseLabel(vault.phase)} />
          </div>
          <a
            href={`${EXPLORER}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block font-mono text-xs text-muted hover:text-ink"
          >
            {address}
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="TVL" value={`$${fmtUnits(vault.totalAssets, vault.decimals)}`} />
        <Stat label="Share price" value={vault.sharePrice.toFixed(4)} />
        <Stat label="Your shares" value={fmtUnits(vault.shareBalance, vault.decimals)} />
        <Stat label="Your position" value={`$${fmtUnits(positionValue, vault.decimals)}`} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Deposit cap" value={`$${fmtUnits(vault.maxDeposits, vault.decimals)}`} />
        <Stat label="Allocator" value={<span className="font-mono text-sm">{shortAddr(vault.allocator)}</span>} />
        <Stat label="Epoch" value={`#${vault.epochId.toString()}`} />
      </div>

      <div className="mt-4 card p-5">
        <div className="text-sm font-medium">Epoch schedule</div>
        <div className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted">Funding start</div>
            <div>{fmtDate(vault.epochInfo.fundingStart)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Epoch start</div>
            <div>{fmtDate(vault.epochInfo.epochStart)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Epoch end</div>
            <div>{fmtDate(vault.epochInfo.epochEnd)}</div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <LpPanel vault={vault} address={address} account={account} refetch={refetch} />
        {isAllocator && <AllocatorPanel vault={vault} address={address} refetch={refetch} />}
        {isOwner && <VaultAdminPanel address={address} refetch={refetch} />}
      </div>
    </div>
  );
}

type VaultData = NonNullable<ReturnType<typeof useVault>["vault"]>;

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-2 break-words text-xs text-red-700/80">{error}</p>;
}

function LpPanel({
  vault,
  address,
  account,
  refetch,
}: {
  vault: VaultData;
  address: Address;
  account?: Address;
  refetch: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");
  const deposit = useAction(refetch);
  const redeem = useAction(refetch);
  const faucet = useAction(refetch);

  const token = vault.asset;
  const zero = "0x0000000000000000000000000000000000000000" as Address;

  const { data: tokenData, refetch: refetchToken } = useReadContracts({
    allowFailure: false,
    contracts: [
      { address: token, abi: erc20Abi, functionName: "balanceOf", args: [account ?? zero] },
      { address: token, abi: erc20Abi, functionName: "allowance", args: [account ?? zero, address] },
    ],
    query: { enabled: Boolean(account), refetchInterval: 8000 },
  });
  const [usdcBal, allowance] = (tokenData as [bigint, bigint] | undefined) ?? [undefined, undefined];

  const amountWei = amount ? safeParse(amount, vault.decimals) : 0n;
  const needsApproval = allowance !== undefined && amountWei > 0n && allowance < amountWei;
  const canDeposit = vault.phase === "funding" && vault.whitelisted;
  const canRedeem = !vault.custodied && vault.phase !== "active";

  const refresh = () => {
    refetch();
    refetchToken();
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Your position</div>
        <button
          className="btn"
          disabled={faucet.pending || !account}
          onClick={() => faucet.run({ address: token, abi: erc20Abi, functionName: "faucet" }).then(refresh)}
        >
          {faucet.pending ? "…" : "Faucet 10k USDC"}
        </button>
      </div>
      <div className="mt-1 text-xs text-muted">
        Wallet: {usdcBal !== undefined ? `$${fmtUnits(usdcBal, vault.decimals)} USDC` : "—"}
        {!vault.whitelisted && account && <span className="ml-2 text-red-700/70">· not whitelisted</span>}
      </div>

      {/* Deposit */}
      <div className="mt-5">
        <label className="label">Deposit (USDC)</label>
        <div className="flex gap-2">
          <input className="input" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {needsApproval ? (
            <button
              className="btn btn-primary whitespace-nowrap"
              disabled={deposit.pending || !canDeposit}
              onClick={() =>
                deposit
                  .run({ address: token, abi: erc20Abi, functionName: "approve", args: [address, amountWei] })
                  .then(refresh)
              }
            >
              {deposit.pending ? "…" : "Approve"}
            </button>
          ) : (
            <button
              className="btn btn-primary whitespace-nowrap"
              disabled={deposit.pending || !canDeposit || amountWei === 0n}
              onClick={() =>
                deposit
                  .run({ address, abi: vaultAbi, functionName: "deposit", args: [amountWei, account!] })
                  .then(() => {
                    setAmount("");
                    refresh();
                  })
              }
            >
              {deposit.pending ? "…" : "Deposit"}
            </button>
          )}
        </div>
        {!canDeposit && <p className="mt-1 text-xs text-muted">Deposits open only during the funding window.</p>}
        <ErrorLine error={deposit.error} />
      </div>

      {/* Redeem */}
      <div className="mt-5">
        <label className="label">Redeem (shares)</label>
        <div className="flex gap-2">
          <input className="input" inputMode="decimal" placeholder="0.0" value={shares} onChange={(e) => setShares(e.target.value)} />
          <button
            className="btn whitespace-nowrap"
            onClick={() => setShares(fmtRaw(vault.shareBalance, vault.decimals))}
          >
            Max
          </button>
          <button
            className="btn btn-primary whitespace-nowrap"
            disabled={redeem.pending || !canRedeem || !shares}
            onClick={() =>
              redeem
                .run({
                  address,
                  abi: vaultAbi,
                  functionName: "redeem",
                  args: [safeParse(shares, vault.decimals), account!, account!],
                })
                .then(() => {
                  setShares("");
                  refresh();
                })
            }
          >
            {redeem.pending ? "…" : "Redeem"}
          </button>
        </div>
        {!canRedeem && <p className="mt-1 text-xs text-muted">Redemptions are paused while the epoch is active.</p>}
        <ErrorLine error={redeem.error} />
      </div>
    </div>
  );
}

function AllocatorPanel({ vault, address, refetch }: { vault: VaultData; address: Address; refetch: () => void }) {
  const [ret, setRet] = useState("");
  const custody = useAction(refetch);
  const returnFunds = useAction(refetch);

  return (
    <div className="card p-5">
      <div className="text-sm font-medium">Allocator</div>
      <p className="mt-1 text-xs text-muted">Custody capital during the epoch and return principal + interest at settlement.</p>

      <button
        className="btn btn-primary mt-4 w-full"
        disabled={custody.pending || vault.custodied || vault.phase !== "active"}
        onClick={() => custody.run({ address, abi: vaultAbi, functionName: "custodyFunds" })}
      >
        {custody.pending ? "…" : vault.custodied ? "Funds custodied" : "Custody funds"}
      </button>
      <ErrorLine error={custody.error} />

      <div className="mt-5">
        <label className="label">Return funds (USDC)</label>
        <p className="mb-1 text-xs text-muted">Approve the vault for this amount on the USDC token first.</p>
        <div className="flex gap-2">
          <input className="input" inputMode="decimal" placeholder="0.0" value={ret} onChange={(e) => setRet(e.target.value)} />
          <button
            className="btn btn-primary whitespace-nowrap"
            disabled={returnFunds.pending || !vault.custodied || !ret}
            onClick={() =>
              returnFunds
                .run({ address, abi: vaultAbi, functionName: "returnFunds", args: [safeParse(ret, vault.decimals)] })
                .then(() => setRet(""))
            }
          >
            {returnFunds.pending ? "…" : "Return"}
          </button>
        </div>
        <ErrorLine error={returnFunds.error} />
      </div>
    </div>
  );
}

function VaultAdminPanel({ address, refetch }: { address: Address; refetch: () => void }) {
  const [wl, setWl] = useState("");
  const [fundingStart, setFundingStart] = useState("");
  const [epochStart, setEpochStart] = useState("");
  const [epochEnd, setEpochEnd] = useState("");
  const whitelist = useAction(refetch);
  const startEpoch = useAction(refetch);

  const toTs = (v: string) => BigInt(Math.floor(new Date(v).getTime() / 1000));

  return (
    <div className="card p-5">
      <div className="text-sm font-medium">Admin · this vault</div>

      <div className="mt-4">
        <label className="label">Whitelist address</label>
        <div className="flex gap-2">
          <input className="input font-mono" placeholder="0x…" value={wl} onChange={(e) => setWl(e.target.value)} />
          <button
            className="btn btn-primary whitespace-nowrap"
            disabled={whitelist.pending || !isAddress(wl)}
            onClick={() =>
              whitelist
                .run({ address, abi: vaultAbi, functionName: "setWhitelistStatus", args: [wl as Address, true] })
                .then(() => setWl(""))
            }
          >
            {whitelist.pending ? "…" : "Add"}
          </button>
        </div>
        <ErrorLine error={whitelist.error} />
      </div>

      <div className="mt-5">
        <label className="label">Start epoch</label>
        <div className="grid gap-2">
          <Field label="Funding start" value={fundingStart} onChange={setFundingStart} />
          <Field label="Epoch start" value={epochStart} onChange={setEpochStart} />
          <Field label="Epoch end" value={epochEnd} onChange={setEpochEnd} />
        </div>
        <button
          className="btn btn-primary mt-3 w-full"
          disabled={startEpoch.pending || !fundingStart || !epochStart || !epochEnd}
          onClick={() =>
            startEpoch.run({
              address,
              abi: vaultAbi,
              functionName: "startEpoch",
              args: [toTs(fundingStart), toTs(epochStart), toTs(epochEnd)],
            })
          }
        >
          {startEpoch.pending ? "…" : "Start epoch"}
        </button>
        <ErrorLine error={startEpoch.error} />
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input className="input" type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function safeParse(v: string, decimals: number): bigint {
  try {
    return parseUnits(v as `${number}`, decimals);
  } catch {
    return 0n;
  }
}

function fmtRaw(v: bigint, decimals: number): string {
  // Plain decimal string for prefilling the Max field (no thousands separators).
  const s = v.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals) || "0";
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
