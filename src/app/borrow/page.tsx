"use client";

import { useState } from "react";

type FormState = {
  businessName: string;
  country: string;
  sector: string;
  amount: string;
  termDays: string;
  purpose: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
};

const INITIAL: FormState = {
  businessName: "",
  country: "",
  sector: "",
  amount: "",
  termDays: "",
  purpose: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  notes: "",
};

export default function BorrowPage() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ cid: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid =
    form.businessName.trim() &&
    form.country.trim() &&
    Number(form.amount) > 0 &&
    Number(form.termDays) > 0 &&
    form.purpose.trim() &&
    form.contactName.trim() &&
    /.+@.+\..+/.test(form.contactEmail);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/loan-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          termDays: Number(form.termDays),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      setResult({ cid: data.cid });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-content px-6 py-16 lg:px-12">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow text-positive">// Application received</div>
          <h1 className="mt-4 text-3xl font-light tracking-tight lg:text-4xl">
            Thanks — we&apos;ll be in touch.
          </h1>
          <p className="mt-6 text-sm text-ink2">
            Your application has been pinned to IPFS so the originator team has a tamper-evident copy. We&apos;ll review
            and reach out to <span className="text-ink">{form.contactEmail}</span> within a few business days.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-sm border border-rule px-4 py-2 font-mono text-xs text-ink2">
            <span className="text-ink3">CID</span>
            <span>{result.cid}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-content px-6 py-16 lg:px-12">
      <div className="mx-auto max-w-2xl">
        <div className="eyebrow">// Borrower onboarding</div>
        <h1 className="mt-4 text-3xl font-light tracking-tight lg:text-4xl">Apply for a loan</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink2">
          Tell us about your business and what you need financing for. An originator will review and, if it&apos;s a
          fit, structure a credit vault for the loan. We may follow up for additional documents.
        </p>

        <form onSubmit={submit} className="mt-10 space-y-8">
          <Section title="Your business">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name *" value={form.businessName} onChange={set("businessName")} placeholder="e.g. AgriCo Senegal" />
              <Field label="Country *" value={form.country} onChange={set("country")} placeholder="e.g. Senegal" />
              <Field
                label="Sector"
                value={form.sector}
                onChange={set("sector")}
                placeholder="e.g. agricultural inputs"
              />
            </div>
          </Section>

          <Section title="Loan terms">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount (USDC) *" value={form.amount} onChange={set("amount")} placeholder="e.g. 50000" inputMode="decimal" />
              <Field label="Term (days) *" value={form.termDays} onChange={set("termDays")} placeholder="e.g. 90" inputMode="numeric" />
            </div>
            <div className="mt-4">
              <label className="label">Use of proceeds *</label>
              <textarea
                className="input min-h-[88px]"
                placeholder="What will the loan finance? E.g. seasonal inputs, equipment, working capital."
                value={form.purpose}
                onChange={set("purpose")}
              />
            </div>
          </Section>

          <Section title="Contact">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name *" value={form.contactName} onChange={set("contactName")} placeholder="Borrower contact" />
              <Field label="Email *" value={form.contactEmail} onChange={set("contactEmail")} placeholder="you@business.com" inputMode="email" />
              <Field label="Phone (optional)" value={form.contactPhone} onChange={set("contactPhone")} placeholder="+221…" inputMode="tel" />
            </div>
            <div className="mt-4">
              <label className="label">Anything else?</label>
              <textarea
                className="input min-h-[72px]"
                placeholder="Optional context: revenue, prior loans, references."
                value={form.notes}
                onChange={set("notes")}
              />
            </div>
          </Section>

          <div className="hairline border-t pt-6">
            <button
              type="submit"
              disabled={!valid || submitting}
              className="btn-accent inline-flex h-10 items-center rounded-sm px-6 text-sm font-medium"
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
            {!valid && (
              <p className="mt-2 text-xs text-ink3">Fill in the required fields (*) to submit.</p>
            )}
            {error && <p className="mt-2 text-xs text-negative">{error}</p>}
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow !text-[10px]">{title}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "email" | "tel" | "text";
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </div>
  );
}
