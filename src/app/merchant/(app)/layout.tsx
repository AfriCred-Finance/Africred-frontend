/**
 * Shell for everything a signed-in merchant sees.
 *
 * The guard runs on the server, before anything renders. Checking in the browser instead
 * would flash a dashboard at someone who is not signed in, and would rely on client code
 * that a determined visitor can simply skip. The API refuses them either way, but showing
 * the shape of the page is itself a small leak and an avoidable one.
 *
 * Deliberately no wallet anywhere: no connect button, no network switcher, no chain. A
 * merchant signs in with a password and pays a supplier. The only signature in this system
 * belongs to our own approver, and it lives in the platform admin, not here.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SESSION_COOKIE } from "@/lib/session";
import { MerchantHeader } from "@/components/merchant/MerchantHeader";

const API = process.env.SETTLEMENT_API_URL ?? "http://127.0.0.1:8787";

async function currentPrincipal() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const res = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res?.ok) return null;
  return (await res.json()) as { email: string; role: string; merchantId: string | null };
}

export default async function MerchantAppLayout({ children }: { children: React.ReactNode }) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/merchant/login");

  // Platform staff have their own console and no merchant of their own, so this area has
  // nothing to show them. Sending them here would produce empty screens and confusing
  // "name the merchant" errors from the API.
  if (principal.role !== "merchant_user") {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-sm text-ink2">
          This area is for merchants. Your account belongs to the platform.
        </p>
        <Link href="/admin" className="btn btn-primary mt-6 inline-block">
          Go to the admin console
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <MerchantHeader email={principal.email} />
      <main className="mx-auto max-w-content px-6 py-10 lg:px-12">{children}</main>
    </div>
  );
}
