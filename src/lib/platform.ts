/**
 * Client-side types and helpers for the platform back office.
 *
 * Everything here speaks to routes the API marks "platform", which means the session
 * behind the proxy must belong to a platform_admin. Nothing in this file checks that: the
 * API refuses, the layout guard redirects, and a third opinion in the browser would only
 * be one more place for the three to disagree.
 */
import { api } from "./merchant";

export type KybState =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "suspended";

export interface PlatformMerchant {
  merchantId: string;
  legalName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  countryIso: string;
  bankAccount: string;
  bankName: string | null;
  kybState: KybState;
  kybSubmittedAt: string | null;
  kybReviewedAt: string | null;
  kybReviewedBy: string | null;
  kybRejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformDeposit {
  depositId: string;
  merchantId: string;
  method: "cash" | "bank_transfer";
  amount: string;
  currency: string;
  receiptNumber: string | null;
  office: string | null;
  bankReference: string | null;
  valueDate: string | null;
  approver: string | null;
  maxAmount: string | null;
  deadline: number | null;
  signature: string | null;
  state: "pending" | "confirmed" | "rejected";
  confirmedAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
}

export interface ReferenceRate {
  corridor: string;
  rate: string;
  source: string;
  effectiveFrom: string;
  createdAt: string;
}

/**
 * The typed data an approver signs to release a deposit.
 *
 * Fetched from the API rather than assembled here. The domain contains the vault address
 * and chain id; a browser-built copy that drifts from the deployed vault still signs
 * cleanly and then reverts on-chain, which surfaces days later as a payment nobody can
 * explain.
 */
export interface Attestation {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, string | number>;
}

/**
 * Which vault this deployment actually drives, and on which chain.
 *
 * Read from the API rather than from build-time configuration. The console must check a
 * signer against the vault the backend will really carry the signature to; a frontend
 * constant that has drifted from the deployment would clear a signature the chain then
 * refuses, which is the failure these guardrails exist to prevent.
 */
export interface VaultInfo {
  chainId: number;
  vault: `0x${string}`;
}

export const vaultInfo = () => api<VaultInfo>("health");

// ------------------------------------------------------------------------------- reads

export const listMerchants = (state?: KybState) =>
  api<{ results: PlatformMerchant[] }>(
    state ? `platform/merchants?state=${state}` : "platform/merchants",
  ).then((r) => r.results);

export const getMerchant = (id: string) =>
  api<PlatformMerchant>(`me/merchant?merchantId=${encodeURIComponent(id)}`);

export const listDeposits = (merchantId: string) =>
  api<{ results: PlatformDeposit[] }>(
    `me/deposits?merchantId=${encodeURIComponent(merchantId)}`,
  ).then((r) => r.results);

export const listRates = () =>
  api<{ results: ReferenceRate[] }>("platform/rates").then((r) => r.results);

/**
 * One dimension's contribution, with its own reasons.
 *
 * `coverage` is what makes the score readable. A dimension nothing is known about is
 * excluded from the weighting rather than scored zero, so a thin file reads as uncertain
 * instead of bad, and the console has to show both numbers or it misleads.
 */
export interface ScoreDimension {
  key: string;
  value: number;
  coverage: number;
  reasons: string[];
}

export interface TransferScore {
  clientKey: string;
  /** 0..1000, over measured dimensions only. Read it next to `coverage`. */
  score: number;
  band: string;
  confidence: string;
  coverage: number;
  cycles: number;
  /** The share of an invoice that may be advanced: the lower of the two bounds below. */
  financingRatio: number;
  bandRatio: number;
  confidenceCap: number;
  reasonCodes: string[];
  dimensions: ScoreDimension[];
  modelVersion: string;
  policyVersion: string;
  computedAt: string;
  validUntil: string;
}

/**
 * Computed on read rather than served from a cache: a stored score is evidence of a past
 * decision, not the answer today. The merchant is passed so one merchant's client cannot
 * be scored on another's history.
 */
export const scoreFor = (clientId: string, merchantId: string) =>
  api<TransferScore>(
    `scores/${encodeURIComponent(clientId)}?merchantId=${encodeURIComponent(merchantId)}`,
  );

// ------------------------------------------------------------------------------ writes

const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

export const startReview = (id: string) =>
  post<PlatformMerchant>(`platform/merchants/${encodeURIComponent(id)}/review`);

export const approveMerchant = (id: string) =>
  post<PlatformMerchant>(`platform/merchants/${encodeURIComponent(id)}/approve`);

export const rejectMerchant = (id: string, reason: string) =>
  post<PlatformMerchant>(`platform/merchants/${encodeURIComponent(id)}/reject`, { reason });

export const suspendMerchant = (id: string, reason: string) =>
  post<PlatformMerchant>(`platform/merchants/${encodeURIComponent(id)}/suspend`, { reason });

export const recordDeposit = (body: {
  depositId: string;
  merchantId: string;
  method: "cash" | "bank_transfer";
  amount: string;
  currency: string;
  receiptNumber?: string;
  office?: string;
  bankReference?: string;
  valueDate?: string;
}) => post<PlatformDeposit>("platform/deposits", body);

export const depositAttestation = (id: string, usdcCeiling: string, deadline: number) =>
  api<Attestation>(
    `platform/deposits/${encodeURIComponent(id)}/attestation` +
      `?usdcCeiling=${usdcCeiling}&deadline=${deadline}`,
  );

export const confirmDeposit = (
  id: string,
  body: { approver: string; usdcCeiling: string; deadline: number; signature: string },
) => post<PlatformDeposit>(`platform/deposits/${encodeURIComponent(id)}/confirm`, body);

/** Persist a snapshot, so a decision taken now stays explainable later. */
export const saveScore = (clientId: string, merchantId: string) =>
  post<TransferScore>(
    `scores/${encodeURIComponent(clientId)}?merchantId=${encodeURIComponent(merchantId)}`,
  );

export const publishRate = (body: {
  fiatCurrency: string;
  toCurrency: string;
  rate: string;
  source: string;
}) => post<ReferenceRate>("platform/rates", body);

// -------------------------------------------------------------------------- presentation

/**
 * What a reviewer can do next, given where the file is.
 *
 * Derived from the state rather than always showing every button, because the API refuses
 * the illegal transitions anyway and a button that only ever produces an error is worse
 * than no button.
 */
export function kybActions(state: KybState): Array<"review" | "approve" | "reject" | "suspend"> {
  switch (state) {
    // Not "approve". The state machine only allows approved from under_review, so a file
    // has to be picked up before it can be cleared: whoever approves is on record as
    // having looked at it. Offering the button here would produce a refusal, not a
    // shortcut.
    case "submitted":
      return ["review", "reject"];
    case "under_review":
      return ["approve", "reject"];
    case "approved":
      return ["suspend"];
    case "rejected":
    case "suspended":
    case "draft":
      return [];
  }
}

/**
 * Bands run T0 to T4 in the credit policy. Tone tracks what the band permits, not the
 * number: T0 advances nothing, so it reads as a refusal rather than as a low score.
 */
export const BAND_TONE: Record<string, string> = {
  T0: "border-red-500/30 text-red-700",
  T1: "border-line text-muted",
  T2: "border-accent/40 text-accent",
  T3: "border-accent/40 text-accent",
  T4: "border-accent/40 text-accent",
};

export const DIMENSION_LABEL: Record<string, string> = {
  repayment: "Repayment",
  settlement: "Settlement",
  kyb: "Verification",
  recurrence: "Recurrence",
  funding: "Funding",
  documents: "Documents",
  concentration: "Concentration",
};

export const KYB_TONE: Record<KybState, string> = {
  draft: "border-line text-muted",
  submitted: "border-accent/40 text-accent",
  under_review: "border-accent/40 text-accent",
  approved: "border-accent/40 text-accent",
  rejected: "border-red-500/30 text-red-700",
  suspended: "border-red-500/30 text-red-700",
};

export const KYB_LABEL: Record<KybState, string> = {
  draft: "Draft",
  submitted: "Awaiting review",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};
