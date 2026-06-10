"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContracts } from "wagmi";
import { parseUnits, type Address, isAddress } from "viem";
import { useVault } from "@/lib/useVault";
import { useAction } from "@/lib/useAction";
import { erc20Abi, vaultAbi } from "@/lib/abis";
import { EXPLORER } from "@/lib/contracts";
import { fmtUnits, fmtDate, fmtBps, fmtRepayment, phaseLabel, shortAddr } from "@/lib/format";
import { Stat, PhaseBadge } from "@/components/Stat";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

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

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Target APR" value={fmtBps(vault.targetAprBps)} />
        <Stat label="Loan term" value={`${vault.loanTermDays.toString()} days`} />
        <Stat label="Repayment" value={fmtRepayment(vault.repaymentType, vault.paymentIntervalDays)} />
        <Stat label="Deposit cap" value={`$${fmtUnits(vault.maxDeposits, vault.decimals)}`} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Stat label="Status" value={phaseLabel(vault.phase)} />
        <Stat label="Allocator" value={<span className="font-mono text-sm">{shortAddr(vault.allocator)}</span>} />
      </div>

      <div className="mt-4 card p-5">
        <div className="text-sm font-medium">Funding window</div>
        <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted">Opens</div>
            <div>{vault.fundingStart === 0n ? "Not set" : fmtDate(vault.fundingStart)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Closes</div>
            <div>{vault.fundingEnd === 0n ? "Not set" : fmtDate(vault.fundingEnd)}</div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <LpPanel vault={vault} address={address} account={account} refetch={refetch} />
        {isAllocator && <AllocatorPanel vault={vault} address={address} refetch={refetch} />}
        {isOwner && <VaultAdminPanel vault={vault} address={address} refetch={refetch} />}
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

  const { data: tokenData, refetch: refetchToken } = useReadContracts({
    allowFailure: false,
    contracts: [
      { address: token, abi: erc20Abi, functionName: "balanceOf", args: [account ?? ZERO] },
      { address: token, abi: erc20Abi, functionName: "allowance", args: [account ?? ZERO, address] },
    ],
    query: { enabled: Boolean(account), refetchInterval: 8000 },
  });
  const [usdcBal, allowance] = (tokenData as [bigint, bigint] | undefined) ?? [undefined, undefined];

  const amountWei = amount ? safeParse(amount, vault.decimals) : 0n;
  const needsApproval = allowance !== undefined && amountWei > 0n && allowance < amountWei;
  const canDeposit = vault.depositsOpen;
  const canRedeem = vault.withdrawalsOpen;

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
      </div>

      {/* Deposit */}
      <div className="mt-5">
        <label className="label">Deposit (USDC)</label>
        <div className="flex gap-2">
          <input
            className="input"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!canDeposit}
          />
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
        {!canDeposit && (
          <p className="mt-1 text-xs text-muted">
            Deposits are closed — they are only open while the funding window is live ({phaseLabel(vault.phase)}).
          </p>
        )}
        <ErrorLine error={deposit.error} />
      </div>

      {/* Redeem */}
      <div className="mt-5">
        <label className="label">Redeem (shares)</label>
        <div className="flex gap-2">
          <input
            className="input"
            inputMode="decimal"
            placeholder="0.0"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            disabled={!canRedeem}
          />
          <button className="btn whitespace-nowrap" onClick={() => setShares(fmtRaw(vault.shareBalance, vault.decimals))}>
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
        {!canRedeem && (
          <p className="mt-1 text-xs text-muted">
            Withdrawals are closed — open during funding and once the admin opens withdrawals.
          </p>
        )}
        <ErrorLine error={redeem.error} />
      </div>
    </div>
  );
}

function AllocatorPanel({ vault, address, refetch }: { vault: VaultData; address: Address; refetch: () => void }) {
  const [ret, setRet] = useState("");
  const custody = useAction(refetch);
  const returnFunds = useAction(refetch);

  const canCustody = vault.state === 2 && !vault.custodied; // Investing

  return (
    <div className="card p-5">
      <div className="text-sm font-medium">Allocator</div>
      <p className="mt-1 text-xs text-muted">
        Once the admin moves the vault to Investing, take custody, deploy to SMEs, then return principal + interest.
      </p>

      <button
        className="btn btn-primary mt-4 w-full"
        disabled={custody.pending || !canCustody}
        onClick={() => custody.run({ address, abi: vaultAbi, functionName: "custodyFunds" })}
      >
        {custody.pending ? "…" : vault.custodied ? "Funds custodied" : "Custody funds"}
      </button>
      {!canCustody && !vault.custodied && (
        <p className="mt-1 text-xs text-muted">Available only when the vault is in the Investing state.</p>
      )}
      <ErrorLine error={custody.error} />

      <div className="mt-5">
        <label className="label">Return funds (USDC)</label>
        <p className="mb-1 text-xs text-muted">Approve the vault for this amount on the USDC token first.</p>
        <div className="flex gap-2">
          <input
            className="input"
            inputMode="decimal"
            placeholder="0.0"
            value={ret}
            onChange={(e) => setRet(e.target.value)}
          />
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

function VaultAdminPanel({ vault, address, refetch }: { vault: VaultData; address: Address; refetch: () => void }) {
  const [fundingStart, setFundingStart] = useState("");
  const [fundingEnd, setFundingEnd] = useState("");
  const startFunding = useAction(refetch);
  const startInvesting = useAction(refetch);
  const openWithdrawals = useAction(refetch);
  const closeVault = useAction(refetch);

  const toTs = (v: string) => BigInt(Math.floor(new Date(v).getTime() / 1000));
  const nowSec = Math.floor(Date.now() / 1000);
  const fundingOver = nowSec >= Number(vault.fundingEnd);

  // Allowed transitions from the current state.
  const canStartFunding = vault.state === 0; // Closed
  const canStartInvesting = vault.state === 1 && fundingOver; // Funding ended
  const canOpenWithdrawals = (vault.state === 1 && fundingOver) || (vault.state === 2 && !vault.custodied);
  const canClose = vault.state !== 0 && !vault.custodied;

  return (
    <div className="card p-5">
      <div className="text-sm font-medium">Admin · lifecycle</div>
      <p className="mt-1 text-xs text-muted">Current state: {phaseLabel(vault.phase)}</p>

      {/* Start funding (only when Closed) */}
      <div className="mt-4">
        <label className="label">Start funding period</label>
        <div className="grid gap-2">
          <Field label="Funding opens" value={fundingStart} onChange={setFundingStart} />
          <Field label="Funding closes" value={fundingEnd} onChange={setFundingEnd} />
        </div>
        <button
          className="btn btn-primary mt-3 w-full"
          disabled={startFunding.pending || !canStartFunding || !fundingStart || !fundingEnd}
          onClick={() =>
            startFunding.run({
              address,
              abi: vaultAbi,
              functionName: "startFunding",
              args: [toTs(fundingStart), toTs(fundingEnd)],
            })
          }
        >
          {startFunding.pending ? "…" : "Start funding"}
        </button>
        {!canStartFunding && (
          <p className="mt-1 text-xs text-muted">Available only when the vault is Closed.</p>
        )}
        <ErrorLine error={startFunding.error} />
      </div>

      {/* Post-funding transitions */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          className="btn"
          disabled={startInvesting.pending || !canStartInvesting}
          onClick={() => startInvesting.run({ address, abi: vaultAbi, functionName: "startInvesting" })}
        >
          {startInvesting.pending ? "…" : "→ Investing"}
        </button>
        <button
          className="btn"
          disabled={openWithdrawals.pending || !canOpenWithdrawals}
          onClick={() => openWithdrawals.run({ address, abi: vaultAbi, functionName: "openWithdrawals" })}
        >
          {openWithdrawals.pending ? "…" : "→ Open withdrawals"}
        </button>
      </div>
      <ErrorLine error={startInvesting.error} />
      <ErrorLine error={openWithdrawals.error} />

      <button
        className="btn mt-2 w-full"
        disabled={closeVault.pending || !canClose}
        onClick={() => closeVault.run({ address, abi: vaultAbi, functionName: "closeVault" })}
      >
        {closeVault.pending ? "…" : "Close vault (reset for new round)"}
      </button>
      <ErrorLine error={closeVault.error} />
      <p className="mt-2 text-xs text-muted">
        After funding closes, switch to Investing (allocator custodies) or straight to Open withdrawals.
      </p>
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
