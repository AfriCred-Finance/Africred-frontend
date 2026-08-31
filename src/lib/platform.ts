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
