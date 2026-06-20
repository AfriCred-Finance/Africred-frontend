"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContracts } from "wagmi";
import { type Address, isAddress } from "viem";
import { useVault } from "@/lib/useVault";
import { useAction } from "@/lib/useAction";
import { erc20Abi, vaultAbi } from "@/lib/abis";
import { EXPLORER } from "@/lib/contracts";
import { ipfsToHttp } from "@/lib/ipfs";
import { fmtUnits, fmtDate, fmtBps, fmtLoanStatus, fmtRepayment, phaseLabel, shortAddr, isOverdue } from "@/lib/format";
import { Stat, PhaseBadge } from "@/components/Stat";
import {
  AllocatorPanel,
  LoanServicingPanel,
  VaultAdminPanel,
  safeParse,
  type VaultData,
} from "@/components/vault/VaultManagePanels";

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
    <div className="mx-auto max-w-content px-6 py-10 lg:px-12">
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
        <Stat label="Loan rate" value={vault.loan ? fmtBps(vault.loan.rateBps) : "—"} />
        <Stat label="Loan term" value={vault.loan ? `${vault.loan.termDays} days` : "—"} />
        <Stat label="Loan status" value={fmtLoanStatus(vault.loan?.status)} />
        <Stat label="Deposit cap" value={`$${fmtUnits(vault.maxDeposits, vault.decimals)}`} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Stat label="Status" value={phaseLabel(vault.phase)} />
        <Stat label="Allocator" value={<span className="font-mono text-sm">{shortAddr(vault.allocator)}</span>} />
      </div>

      <LoanCard vault={vault} />

      {vault.tranched && (
        <div className="mt-4 card p-5">
          <div className="text-sm font-medium">Tranche structure (senior / junior)</div>
          <div className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted">Senior (LP pool)</div>
              <div>${fmtUnits(vault.totalAssets, vault.decimals)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Junior first-loss buffer</div>
              <div>${fmtUnits(vault.bufferAmount, vault.decimals)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Senior protection</div>
              <div>
                {vault.totalAssets > 0n ? `${Number((vault.bufferAmount * 10000n) / vault.totalAssets) / 100}%` : "—"} of
                senior
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Losses hit the junior buffer first; seniors are protected up to the buffer.
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <LpPanel vault={vault} address={address} account={account} refetch={refetch} />
        {isAllocator && <AllocatorPanel vault={vault} address={address} refetch={refetch} />}
        {isOwner && <VaultAdminPanel vault={vault} address={address} refetch={refetch} />}
        {isOwner && <LoanServicingPanel vault={vault} address={address} refetch={refetch} />}
      </div>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-2 break-words text-xs text-red-700/80">{error}</p>;
}

function LoanCard({ vault }: { vault: VaultData }) {
  const loan = vault.loan;
  if (!loan) return null;
  const repaidPct = loan.principal > 0n ? Number((loan.amountRepaid * 100n) / loan.principal) : 0;
  const isLive = loan.status !== 2 && loan.status !== 3;
  const overdue = isLive && isOverdue(loan.nextDueDate);
  return (
    <div className="mt-4 card p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Loan · NFT #{vault.loanId.toString()}</div>
        <div className="flex items-center gap-2">
          {overdue && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600">
              ⚠️ Overdue
            </span>
          )}
          <span className="tag">{fmtLoanStatus(loan.status)}</span>
        </div>
      </div>
      <div className="mt-3 grid gap-4 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted">Principal</div>
          <div>${fmtUnits(loan.principal, vault.decimals)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Rate</div>
          <div>{fmtBps(loan.rateBps)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Term</div>
          <div>{loan.termDays} days</div>
        </div>
        <div>
          <div className="text-xs text-muted">Repaid</div>
          <div>
            ${fmtUnits(loan.amountRepaid, vault.decimals)} ({repaidPct}%)
          </div>
        </div>
      </div>
      <div className="mt-3 text-sm">
        <div className="text-xs text-muted">Repayment</div>
        <div>{fmtRepayment(loan.repaymentType, loan.installments)}</div>
      </div>
      {loan.description && (
        <div className="mt-3 text-sm">
          <div className="text-xs text-muted">Description</div>
          <p className="whitespace-pre-line">{loan.description}</p>
        </div>
      )}
      {isLive && (
        <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted">Next due date</div>
            <div className={overdue ? "font-medium text-red-600" : ""}>
              {loan.nextDueDate > 0n ? fmtDate(loan.nextDueDate) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Next installment</div>
            <div>
              {loan.nextInstallmentAmount > 0n
                ? `$${fmtUnits(loan.nextInstallmentAmount, vault.decimals)}`
                : "—"}
              {loan.repaymentType !== 0 && (
                <span className="ml-2 text-xs text-muted">
                  ({loan.installmentsPaid}/{loan.installments}
                  {loan.repaymentType === 1 && " interest"})
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs text-muted">Borrower ref</div>
          <div className="font-mono text-xs">{loan.borrowerRef.slice(0, 18)}…</div>
        </div>
        <div>
          <div className="text-xs text-muted">Dossier</div>
          <div>
            {loan.dossierURI ? (
              <a
                className="break-all text-ink underline"
                href={ipfsToHttp(loan.dossierURI)}
                target="_blank"
                rel="noreferrer"
              >
                {loan.dossierURI}
              </a>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>
    </div>
  );
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

function fmtRaw(v: bigint, decimals: number): string {
  // Plain decimal string for prefilling the Max field (no thousands separators).
  const s = v.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals) || "0";
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
