/**
 * Client-side helpers for the merchant area.
 *
 * Everything goes through the Next proxy, which attaches the session from an httpOnly
 * cookie. Nothing here ever holds a token, and no merchant id is ever sent: the API takes
 * the tenant from the session, so passing one would at best be ignored and at worst be
 * refused as reaching for someone else's account.
 */

export interface Principal {
  userId: string;
  email: string;
  role: "platform_admin" | "merchant_user";
  merchantId: string | null;
}

export interface Merchant {
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
  kybState: "draft" | "submitted" | "under_review" | "approved" | "rejected" | "suspended";
  kybRejectionReason: string | null;
}

export interface Balance {
  merchantId: string;
  currency: string;
  balance: string;
  reserved: string;
  available: string;
}

export interface Client {
  clientId: string;
  name: string;
  addressLine: string | null;
  phone: string | null;
  externalRef: string | null;
  active: boolean;
}

export interface Quote {
  baseAmount: string;
  fxCommission: string;
  transferCommission: string;
  tax: string;
  totalCost: string;
  totalAmount: string;
  fiatCurrency: string;
  toAmount: string;
  toCurrency: string;
}

export interface Operation {
  orderId: string;
  clientName: string;
  supplierName: string;
  toAmount: string;
  toCurrency: string;
  fiatCurrency: string;
  fiatExpected: string;
  state: "pending_funds" | "funded" | "consumed" | "cancelled";
  createdAt: string;
  payout?: { drawTxHash: string | null; settledAt: string | null; state: string } | null;
}

export interface Deposit {
  depositId: string;
  method: "cash" | "bank_transfer";
  amount: string;
  currency: string;
  receiptNumber: string | null;
  bankReference: string | null;
  state: "pending" | "confirmed" | "rejected";
  confirmedAt: string | null;
  createdAt: string;
}

/** Thrown with the API's own wording, which is more useful than anything invented here. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/settlement/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new ApiError(res.status, (body.error as string) ?? `HTTP ${res.status}`);
  return body as T;
}

/** Sign in or sign up. The token stops at the Next route; only identity comes back. */
export async function session(
  action: "login" | "signup",
  payload: Record<string, unknown>,
): Promise<{ principal: Principal; merchant?: Merchant }> {
  const res = await fetch("/api/merchant/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, (body.error as string) ?? "sign-in failed");
  return body as unknown as { principal: Principal; merchant?: Merchant };
}

export async function signOut(): Promise<void> {
  await fetch("/api/merchant/session", { method: "DELETE" });
}

// ------------------------------------------------------------------------ formatting

/**
 * Minor units to a readable figure.
 *
 * XOF has no minor unit in practice, so amounts are held as whole francs; USDC has six.
 * Getting this wrong shows a merchant a number a million times off, so the decimals are
 * per currency rather than a single default.
 */
const DECIMALS: Record<string, number> = { XOF: 0, USDC: 6, CNY: 2, EUR: 2, USD: 2 };

export function decimalsFor(currency: string): number {
  return DECIMALS[currency] ?? 2;
}

/**
 * A figure as typed into a form, into the minor units the API stores.
 *
 * The inverse of `money`, and it has to exist somewhere: an operator types 500000 francs,
 * and XOF having no minor unit is exactly the kind of per-currency detail that gets
 * assumed wrong at the one call site that does its own conversion.
 */
export function toMinor(value: string, currency: string): string {
  const d = decimalsFor(currency);
  const [whole, frac = ""] = value.trim().replace(/\s/g, "").split(".");
  const padded = (frac + "0".repeat(d)).slice(0, d);
  return String(BigInt(whole || "0") * 10n ** BigInt(d) + BigInt(padded || "0"));
}

export function money(minor: string | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "-";
  const d = DECIMALS[currency] ?? 2;
  const value = Number(minor) / 10 ** d;
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })} ${currency}`;
}

/**
 * What a merchant should read about a payment.
 *
 * Their words, not the record's: they care whether their supplier has the money, not what
 * the internal state is called. Defined once, because three copies drift into a list
 * saying one thing and the page it opens saying another.
 */
export function paymentStatus(o: {
  state: string;
  payout?: { state: string; drawTxHash: string | null; settledAt: string | null } | null;
}): string {
  if (o.state === "cancelled") return "Cancelled";
  if (o.payout?.state === "failed") return "Failed";
  if (o.payout?.settledAt) return "Completed";
  if (o.payout?.drawTxHash) return "Supplier paid";
  return "In progress";
}

/** What the merchant should understand from a KYB state, in their words rather than ours. */
export function kybMessage(state: Merchant["kybState"], reason: string | null): {
  tone: "wait" | "ok" | "bad";
  title: string;
  detail: string;
} {
  switch (state) {
    case "approved":
      return { tone: "ok", title: "Account verified", detail: "You can create operations." };
    case "draft":
      return {
        tone: "wait",
        title: "Documents needed",
        detail: "Upload your company documents, then submit your file for review.",
      };
    case "submitted":
    case "under_review":
      return {
        tone: "wait",
        title: "Under review",
        detail: "We are checking your file. You will be able to operate once it is approved.",
      };
    case "rejected":
      return {
        tone: "bad",
        title: "File rejected",
        detail: reason ?? "Contact us to find out what is missing.",
      };
    case "suspended":
      return {
        tone: "bad",
        title: "Account suspended",
        detail: reason ?? "Contact us.",
      };
  }
}
