"use client";

import React, { useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { isAddress, parseUnits, type Address } from "viem";
import type { useVault } from "@/lib/useVault";
import { useAction } from "@/lib/useAction";
import { erc20Abi, vaultAbi, loanRegistryAbi } from "@/lib/abis";
import { fmtUnits, phaseLabel } from "@/lib/format";
import { Stat } from "@/components/Stat";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export type VaultData = NonNullable<ReturnType<typeof useVault>["vault"]>;

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-2 break-words text-xs text-red-700/80">{error}</p>;
}

export function safeParse(v: string, decimals: number): bigint {
  try {
    return parseUnits(v as `${number}`, decimals);
  } catch {
    return 0n;
  }
}

export function LoanServicingPanel({
  vault,
  address,
  refetch,
}: {
  vault: VaultData;
  address: Address;
  refetch: () => void;
}) {
  const { address: account } = useAccount();
  const loan = vault.loan;
  const record = useAction(refetch);
  const status = useAction(refetch);
  const restructure = useAction(refetch);
  const recovery = useAction(refetch);
  const registry = vault.loanRegistry;
  const id = vault.loanId;

  // Repayment form state — admin only updates the next due date; the amount is fixed by the schedule.
  const [newDueDate, setNewDueDate] = useState("");
  const [showRestructure, setShowRestructure] = useState(false);

  // Recovery form state
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryAmt, setRecoveryAmt] = useState("");
  const recoveryWei = recoveryAmt ? safeParse(recoveryAmt, vault.decimals) : 0n;
  const canRecord = vault.custodied && !vault.recoveryRecorded;

  // USDC allowance for the vault (shared by recordRepayment AND recordRecovery — both pull from admin).
  const { data: usdcAllowanceData, refetch: refetchUsdcAllowance } = useReadContracts({
    allowFailure: false,
    contracts: [
      { address: vault.asset, abi: erc20Abi, functionName: "allowance", args: [account ?? ZERO, address] },
    ],
    query: { enabled: Boolean(account && vault.custodied), refetchInterval: 8000 },
  });
  const usdcAllowance = (usdcAllowanceData as [bigint] | undefined)?.[0];
  const recoveryNeedsApproval = usdcAllowance !== undefined && recoveryWei > 0n && usdcAllowance < recoveryWei;

  // Restructure form state
  const [rs, setRs] = useState({
    principal: "",
    ratePct: "",
    termDays: "",
    installments: "",
    nextAmt: "",
    nextDueDate: "",
  });
  const setRsField = (k: keyof typeof rs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRs((f) => ({ ...f, [k]: e.target.value }));

  if (!loan) return null;

  const repaymentType = loan.repaymentType; // 0 bullet, 1 interest+principal, 2 amortizing
  const installmentsPaid = loan.installmentsPaid;
  const totalInstallments = loan.installments;
  const isPrincipalDue =
    repaymentType === 1 && installmentsPaid === totalInstallments;
  const isLastAmortizing =
    repaymentType === 2 && installmentsPaid + 1 === totalInstallments;
  // Bullet (single payment) / amortizing last installment / IThenP principal payment — no "next" anything.
  const isFinalPayment = repaymentType === 0 || isPrincipalDue || isLastAmortizing;

  const nowTs = BigInt(Math.floor(Date.now() / 1000));
  const overdue = loan.nextDueDate > 0n && nowTs > loan.nextDueDate && loan.status !== 2 && loan.status !== 3;

  const newDueDateTs = newDueDate
    ? BigInt(Math.floor(new Date(newDueDate).getTime() / 1000))
    : 0n;

  // Repayment requires vault to be in Custody with custodied=true (so vault.recordRepayment can pull USDC).
  const canRepay = vault.custodied && loan.status !== 2 && loan.status !== 3 && loan.nextInstallmentAmount > 0n;
  const repaymentNeedsApproval =
    canRepay && usdcAllowance !== undefined && usdcAllowance < loan.nextInstallmentAmount;

  function approveForRepayment() {
    record
      .run({
        address: vault.asset,
        abi: erc20Abi,
        functionName: "approve",
        args: [address, loan!.nextInstallmentAmount],
      })
      .then(() => refetchUsdcAllowance());
  }

  function submitRepayment() {
    record
      .run({
        address,
        abi: vaultAbi,
        functionName: "recordRepayment",
        args: [newDueDateTs],
      })
      .then(() => {
        setNewDueDate("");
        refetchUsdcAllowance();
      });
  }

  function submitRestructure() {
    restructure.run({
      address: registry,
      abi: loanRegistryAbi,
      functionName: "restructureLoan",
      args: [
        id,
        {
          principal: safeParse(rs.principal, vault.decimals),
          rateBps: BigInt(Math.round(Number(rs.ratePct || "0") * 100)),
          termDays: Number(rs.termDays || "0"),
          installments: Number(rs.installments || "0"),
          nextInstallmentAmount: safeParse(rs.nextAmt, vault.decimals),
          nextDueDate: rs.nextDueDate
            ? BigInt(Math.floor(new Date(rs.nextDueDate).getTime() / 1000))
            : 0n,
        },
      ],
    });
  }

  return (
    <div className="card p-5">
      <div className="text-sm font-medium">Loan servicing</div>
      <p className="mt-1 text-xs text-muted">
        As the loan NFT holder you record off-chain repayments and update the loan's status.
      </p>

      {/* Schedule overview */}
      {loan.status !== 2 && loan.status !== 3 && (
        <div className={`mt-4 rounded-lg border p-3 ${overdue ? "border-red-500/40 bg-red-500/5" : "border-line"}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Installment schedule</span>
            {overdue && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600">
                ⚠ Overdue
              </span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted">Next due</div>
              <div className={overdue ? "font-medium text-red-600" : "font-medium"}>
                {loan.nextDueDate > 0n
                  ? new Date(Number(loan.nextDueDate) * 1000).toLocaleDateString(undefined, {
                      dateStyle: "medium",
                    })
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">
                {isPrincipalDue ? "Principal due" : "Amount due"}
              </div>
              <div className="font-medium">
                ${fmtUnits(loan.nextInstallmentAmount, vault.decimals)}
                {isPrincipalDue && (
                  <span className="ml-1 text-xs text-muted">(principal)</span>
                )}
              </div>
            </div>
            {repaymentType !== 0 && (
              <div className="col-span-2">
                <div className="text-xs text-muted">Progress</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-line">
                    <div
                      className="h-1.5 rounded-full bg-accent"
                      style={{
                        width: `${Math.min(100, (installmentsPaid / (totalInstallments + (repaymentType === 1 ? 1 : 0))) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted">
                    {installmentsPaid}/{totalInstallments}
                    {repaymentType === 1 && " interest"}
                    {isPrincipalDue && " + principal due"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Record repayment */}
      {loan.status !== 2 && loan.status !== 3 && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="label">
              {isPrincipalDue ? "Principal repayment" : "Record installment"} (USDC)
            </label>
            <input
              className="input bg-ink/[0.03] text-muted"
              value={`$${fmtUnits(loan.nextInstallmentAmount, vault.decimals)} (fixed by the schedule)`}
              readOnly
            />
            <p className="mt-1 text-xs text-muted">
              USDC is pulled from your wallet on click. To change the amount, restructure the loan.
            </p>
          </div>

          {!isFinalPayment && (
            <div>
              <label className="label">Next due date (after this payment)</label>
              <input
                className="input"
                type="datetime-local"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
              />
            </div>
          )}
          {isPrincipalDue && (
            <p className="text-xs text-muted">
              This is the final principal payment — once recorded, the loan will be marked <strong>Repaid</strong>.
              You can then close the vault to open withdrawals.
            </p>
          )}
          {!canRepay && loan.nextInstallmentAmount > 0n && (
            <p className="text-xs text-muted">
              Repayments are only accepted while the vault is in Custody with funds deployed.
            </p>
          )}

          {repaymentNeedsApproval ? (
            <button
              className="btn btn-primary w-full"
              disabled={record.pending || !canRepay}
              onClick={approveForRepayment}
            >
              {record.pending ? "…" : `Approve $${fmtUnits(loan.nextInstallmentAmount, vault.decimals)} USDC`}
            </button>
          ) : (
            <button
              className="btn btn-primary w-full"
              disabled={record.pending || !canRepay || (!isFinalPayment && !newDueDate)}
              onClick={submitRepayment}
            >
              {record.pending ? "…" : "Record repayment"}
            </button>
          )}
          <ErrorLine error={record.error} />
        </div>
      )}

      {/* Status buttons */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          className="btn"
          disabled={status.pending}
          onClick={() =>
            status.run({ address: registry, abi: loanRegistryAbi, functionName: "setStatus", args: [id, 2] })
          }
        >
          Mark repaid
        </button>
        <button
          className="btn"
          disabled={status.pending}
          onClick={() =>
            status.run({ address: registry, abi: loanRegistryAbi, functionName: "setStatus", args: [id, 3] })
          }
        >
          Mark defaulted
        </button>
      </div>
      <ErrorLine error={status.error} />

      {/* Recovery section — separate from mark-defaulted by design */}
      <button
        className="btn mt-4 w-full text-xs"
        onClick={() => setShowRecovery((v) => !v)}
      >
        {showRecovery ? "▲ Hide recovery" : "▼ Send recovery"}
      </button>
      {showRecovery && (
        <div className="mt-3 space-y-3 rounded-lg border border-line p-3">
          <p className="text-xs text-muted">
            Deposit whatever USDC was recovered off-chain into the vault. This settles custody, applies the
            senior-first waterfall (if tranched), and opens withdrawals so LPs can redeem against the
            recovered NAV.{" "}
            <strong>One-shot per custody round.</strong>
          </p>
          {vault.recoveryRecorded ? (
            <p className="text-xs text-accent">Recovery already recorded for this round.</p>
          ) : !vault.custodied ? (
            <p className="text-xs text-muted">
              Recovery can only be sent while funds are under custody. Current state:{" "}
              {phaseLabel(vault.phase)}.
            </p>
          ) : (
            <>
              <div>
                <label className="label text-xs">Recovery amount (USDC)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="0.0 (total loss = 0)"
                  value={recoveryAmt}
                  onChange={(e) => setRecoveryAmt(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted">
                  Pulled from your wallet ({account ? "connected" : "not connected"}). Zero is allowed for a total loss.
                </p>
              </div>
              {recoveryNeedsApproval ? (
                <button
                  className="btn btn-primary w-full"
                  disabled={recovery.pending || !canRecord}
                  onClick={() =>
                    recovery
                      .run({
                        address: vault.asset,
                        abi: erc20Abi,
                        functionName: "approve",
                        args: [address, recoveryWei],
                      })
                      .then(() => refetchUsdcAllowance())
                  }
                >
                  {recovery.pending ? "…" : "Approve USDC"}
                </button>
              ) : (
                <button
                  className="btn btn-primary w-full"
                  disabled={recovery.pending || !canRecord}
                  onClick={() =>
                    recovery
                      .run({ address, abi: vaultAbi, functionName: "recordRecovery", args: [recoveryWei] })
                      .then(() => {
                        setRecoveryAmt("");
                        refetchUsdcAllowance();
                      })
                  }
                >
                  {recovery.pending ? "…" : "Send recovery"}
                </button>
              )}
              <ErrorLine error={recovery.error} />
            </>
          )}
        </div>
      )}

      {/* Restructure section */}
      <button
        className="btn mt-4 w-full text-xs"
        onClick={() => setShowRestructure((v) => !v)}
      >
        {showRestructure ? "▲ Hide restructure" : "▼ Restructure loan"}
      </button>
      {showRestructure && (
        <div className="mt-3 space-y-3 rounded-lg border border-line p-3">
          <p className="text-xs text-muted">
            Restructuring resets the payment schedule and sets new terms. The loan status returns to{" "}
            <strong>Active</strong> and the installment counter resets to 0.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-xs">New principal (USDC)</label>
              <input className="input" inputMode="decimal" placeholder={fmtUnits(loan.principal, vault.decimals)} value={rs.principal} onChange={setRsField("principal")} />
            </div>
            <div>
              <label className="label text-xs">New flat rate (%)</label>
              <input className="input" inputMode="decimal" placeholder="e.g. 12" value={rs.ratePct} onChange={setRsField("ratePct")} />
            </div>
            <div>
              <label className="label text-xs">New term (days)</label>
              <input className="input" inputMode="decimal" placeholder={String(loan.termDays)} value={rs.termDays} onChange={setRsField("termDays")} />
            </div>
            <div>
              <label className="label text-xs">New installments</label>
              <input className="input" inputMode="decimal" placeholder={String(loan.installments)} value={rs.installments} onChange={setRsField("installments")} />
            </div>
            <div>
              <label className="label text-xs">First installment amount (USDC)</label>
              <input className="input" inputMode="decimal" placeholder="0.0" value={rs.nextAmt} onChange={setRsField("nextAmt")} />
            </div>
            <div>
              <label className="label text-xs">First due date</label>
              <input className="input" type="datetime-local" value={rs.nextDueDate} onChange={(e) => setRs((f) => ({ ...f, nextDueDate: e.target.value }))} />
            </div>
          </div>
          <button
            className="btn btn-primary w-full"
            disabled={restructure.pending || !rs.principal || !rs.ratePct || !rs.termDays || !rs.installments || !rs.nextAmt || !rs.nextDueDate}
            onClick={submitRestructure}
          >
            {restructure.pending ? "…" : "Restructure loan"}
          </button>
          <ErrorLine error={restructure.error} />
        </div>
      )}
    </div>
  );
}

export function AllocatorPanel({ vault, address, refetch }: { vault: VaultData; address: Address; refetch: () => void }) {
  const custody = useAction(refetch);

  const canCustody = vault.state === 2 && !vault.custodied;
  const isUndercollected =
    vault.loan !== undefined && vault.totalAssets > 0n && vault.totalAssets < vault.loan.principal;

  function tryCustody() {
    if (isUndercollected && vault.loan) {
      const collected = fmtUnits(vault.totalAssets, vault.decimals);
      const principal = fmtUnits(vault.loan.principal, vault.decimals);
      const ok = window.confirm(
        `Heads up: only $${collected} USDC has been collected, but the loan principal is $${principal}.\n\n` +
          `The loan schedule is fixed at creation: the admin will still need to repay the full $${principal} ` +
          `principal + interest, not just the $${collected} that was actually deployed. The gap comes out ` +
          `of the admin's own wallet at repayment time.\n\n` +
          `Proceed with custody anyway?`,
      );
      if (!ok) return;
    }
    custody.run({ address, abi: vaultAbi, functionName: "custodyFunds" });
  }

  return (
    <div className="card p-5">
      <div className="text-sm font-medium">Allocator</div>
      <p className="mt-1 text-xs text-muted">
        Once the admin moves the vault to Custody, take custody and deploy to the SME. Repayments come back into the
        vault through the admin's <strong>Record repayment</strong> action — coordinate USDC transfers off-chain.
      </p>

      {canCustody && isUndercollected && vault.loan && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <p className="font-medium text-amber-700">⚠ Vault is undercollected</p>
          <p className="mt-1 text-amber-800/80">
            Collected ${fmtUnits(vault.totalAssets, vault.decimals)} of the ${fmtUnits(vault.loan.principal, vault.decimals)} loan principal.
            The admin will still owe the full principal + interest at repayment.
          </p>
        </div>
      )}

      <button
        className="btn btn-primary mt-4 w-full"
        disabled={custody.pending || !canCustody}
        onClick={tryCustody}
      >
        {custody.pending ? "…" : vault.custodied ? "Funds custodied" : "Custody funds"}
      </button>
      {!canCustody && !vault.custodied && (
        <p className="mt-1 text-xs text-muted">Available only when the vault is in the Custody state.</p>
      )}
      <ErrorLine error={custody.error} />
    </div>
  );
}

export function VaultAdminPanel({ vault, address, refetch }: { vault: VaultData; address: Address; refetch: () => void }) {
  const startFunding = useAction(refetch);
  const startCustody = useAction(refetch);
  const closeVault = useAction(refetch);

  const { address: account } = useAccount();
  const [bufferAmt, setBufferAmt] = useState("");
  const buffer = useAction(refetch);
  const token = vault.asset;
  const { data: bufTokenData, refetch: refetchBufToken } = useReadContracts({
    allowFailure: false,
    contracts: [{ address: token, abi: erc20Abi, functionName: "allowance", args: [account ?? ZERO, address] }],
    query: { enabled: Boolean(account && vault.tranched), refetchInterval: 8000 },
  });
  const bufAllow = (bufTokenData as [bigint] | undefined)?.[0];
  const bufWei = bufferAmt ? safeParse(bufferAmt, vault.decimals) : 0n;
  const bufNeedsApproval = bufAllow !== undefined && bufWei > 0n && bufAllow < bufWei;
  const canBuffer = vault.tranched && vault.state === 1 && !vault.custodied;

  const canStartFunding = vault.state === 0;
  const canStartCustody = vault.state === 1 && (!vault.tranched || vault.bufferAmount > 0n);
  // Closeable when in Custody AND either funds were never custodied, or the loan has been settled
  // (Repaid via installments, or a recovery was recorded for a default).
  const loanRepaid = vault.loan?.status === 2;
  const canClose = vault.state === 2 && (!vault.custodied || loanRepaid || vault.recoveryRecorded);

  return (
    <div className="card p-5">
      <div className="text-sm font-medium">Admin · lifecycle</div>
      <p className="mt-1 text-xs text-muted">Current state: {phaseLabel(vault.phase)}</p>

      <button
        className="btn btn-primary mt-4 w-full"
        disabled={startFunding.pending || !canStartFunding}
        onClick={() => startFunding.run({ address, abi: vaultAbi, functionName: "startFunding" })}
      >
        {startFunding.pending ? "…" : "→ Start funding"}
      </button>
      {!canStartFunding && vault.state === 0 ? null : !canStartFunding && (
        <p className="mt-1 text-xs text-muted">Available only when the vault is Closed.</p>
      )}
      <ErrorLine error={startFunding.error} />

      {vault.tranched && (
        <div className="mt-5">
          <label className="label">First-loss buffer (junior — you deposit)</label>
          <p className="mb-1 text-xs text-muted">Current buffer: ${fmtUnits(vault.bufferAmount, vault.decimals)}</p>
          <div className="flex gap-2">
            <input
              className="input"
              inputMode="decimal"
              placeholder="0.0"
              value={bufferAmt}
              onChange={(e) => setBufferAmt(e.target.value)}
              disabled={!canBuffer}
            />
            {bufNeedsApproval ? (
              <button
                className="btn btn-primary whitespace-nowrap"
                disabled={buffer.pending || !canBuffer}
                onClick={() =>
                  buffer
                    .run({ address: token, abi: erc20Abi, functionName: "approve", args: [address, bufWei] })
                    .then(() => refetchBufToken())
                }
              >
                {buffer.pending ? "…" : "Approve"}
              </button>
            ) : (
              <button
                className="btn btn-primary whitespace-nowrap"
                disabled={buffer.pending || !canBuffer || bufWei === 0n}
                onClick={() =>
                  buffer
                    .run({ address, abi: vaultAbi, functionName: "depositBuffer", args: [bufWei] })
                    .then(() => {
                      setBufferAmt("");
                      refetchBufToken();
                    })
                }
              >
                {buffer.pending ? "…" : "Deposit buffer"}
              </button>
            )}
          </div>
          {!canBuffer && <p className="mt-1 text-xs text-muted">Deposit the buffer during Funding.</p>}
          <ErrorLine error={buffer.error} />
        </div>
      )}

      <button
        className="btn mt-4 w-full"
        disabled={startCustody.pending || !canStartCustody}
        onClick={() => startCustody.run({ address, abi: vaultAbi, functionName: "startCustody" })}
      >
        {startCustody.pending ? "…" : "→ Start custody"}
      </button>
      {vault.state === 1 && vault.tranched && vault.bufferAmount === 0n && (
        <p className="mt-1 text-xs text-muted">Deposit the first-loss buffer before starting custody.</p>
      )}
      <ErrorLine error={startCustody.error} />

      <button
        className="btn mt-4 w-full"
        disabled={closeVault.pending || !canClose}
        onClick={() => closeVault.run({ address, abi: vaultAbi, functionName: "closeVault" })}
      >
        {closeVault.pending ? "…" : "→ Close vault (open withdrawals)"}
      </button>
      {vault.state === 2 && vault.custodied && !loanRepaid && !vault.recoveryRecorded && (
        <p className="mt-1 text-xs text-muted">
          Funds are held by the allocator. Walk the loan to <strong>Repaid</strong> via Record repayment, or record a
          recovery, before closing.
        </p>
      )}
      {vault.state === 2 && (loanRepaid || vault.recoveryRecorded) && (
        <p className="mt-1 text-xs text-muted">
          Loan settled — close to unfreeze NAV and open LP withdrawals.
        </p>
      )}
      <ErrorLine error={closeVault.error} />

      <p className="mt-3 text-xs text-muted">
        Closed → Funding (deposits/withdrawals open) → Custody (allocator pulls funds) → close to Open withdrawals (LPs redeem).
      </p>
    </div>
  );
}

export function VaultManageSection({
  vault,
  address,
  account,
  refetch,
  wide = false,
}: {
  vault: VaultData;
  address: Address;
  account?: Address;
  refetch: () => void;
  wide?: boolean;
}) {
  const isAllocator = account && account.toLowerCase() === vault.allocator.toLowerCase();
  const isOwner = account && account.toLowerCase() === vault.owner.toLowerCase();

  if (!isAllocator && !isOwner) {
    return (
      <p className="text-xs text-muted">
        Connect the vault admin or allocator wallet to manage this vault.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Vault TVL" value={`$${fmtUnits(vault.totalAssets, vault.decimals)}`} />
        <Stat label="Deposit cap" value={`$${fmtUnits(vault.maxDeposits, vault.decimals)}`} />
        <Stat label="Vault Status" value={phaseLabel(vault.phase)} />
      </div>
      <div className={`grid gap-4 ${wide ? "lg:grid-cols-2 xl:grid-cols-3" : ""}`}>
        {isOwner && <VaultAdminPanel vault={vault} address={address} refetch={refetch} />}
        {isAllocator && <AllocatorPanel vault={vault} address={address} refetch={refetch} />}
        {isOwner && <LoanServicingPanel vault={vault} address={address} refetch={refetch} />}
        {isOwner && vault.whitelistEnabled && (
          <DepositorWhitelistPanel vault={vault} address={address} refetch={refetch} />
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// Depositor whitelist management — visible only when `vault.whitelistEnabled` is true
// --------------------------------------------------------------------------------------------

export function DepositorWhitelistPanel({
  vault,
  address,
  refetch,
}: {
  vault: VaultData;
  address: Address;
  refetch: () => void;
}) {
  const [addr, setAddr] = useState("");
  const addAction = useAction(refetch);
  const removeAction = useAction(refetch);

  // Live check on the address the admin is typing — read isDepositorWhitelisted from chain.
  const validAddr = isAddress(addr);
  const { data: isWhitelisted, refetch: refetchCheck } = useReadContracts({
    allowFailure: false,
    contracts: validAddr
      ? [{ address, abi: vaultAbi, functionName: "isDepositorWhitelisted", args: [addr as Address] }]
      : [],
    query: { enabled: validAddr, refetchInterval: 8000 },
  });
  const currentStatus = (isWhitelisted as [boolean] | undefined)?.[0];

  const refreshAll = () => {
    refetch();
    refetchCheck();
  };

  function submitAdd() {
    if (!validAddr) return;
    addAction
      .run({
        address,
        abi: vaultAbi,
        functionName: "setDepositorWhitelist",
        args: [[addr as Address], true],
      })
      .then(refreshAll);
  }

  function submitRemove() {
    if (!validAddr) return;
    removeAction
      .run({
        address,
        abi: vaultAbi,
        functionName: "setDepositorWhitelist",
        args: [[addr as Address], false],
      })
      .then(refreshAll);
  }

  return (
    <div className="card p-5">
      <div className="text-sm font-medium">Depositor whitelist</div>
      <p className="mt-1 text-xs text-muted">
        Only listed addresses can deposit. Add or remove one at a time below.
      </p>

      <div className="mt-4 space-y-2">
        <label className="label">Address</label>
        <input
          className="input font-mono text-[12px]"
          placeholder="0x…"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
        />
        {validAddr && (
          <p
            className={`text-[11px] ${
              currentStatus === undefined ? "text-muted" : currentStatus ? "text-positive" : "text-ink2"
            }`}
          >
            {currentStatus === undefined
              ? "Checking…"
              : currentStatus
                ? "Currently whitelisted"
                : "Not whitelisted"}
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!validAddr || addAction.pending || currentStatus === true}
          onClick={submitAdd}
        >
          {addAction.pending ? "…" : "Whitelist"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!validAddr || removeAction.pending || currentStatus === false}
          onClick={submitRemove}
        >
          {removeAction.pending ? "…" : "Remove"}
        </button>
      </div>
      <ErrorLine error={addAction.error} />
      <ErrorLine error={removeAction.error} />
    </div>
  );
}
