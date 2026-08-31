/**
 * The admin console is behind a password.
 *
 * Lives in a route group so /admin/login stays outside it. A guard that also covered the
 * sign-in page would redirect it to itself, forever.
 *
 * It used to be open to anyone who knew the URL, on the reasoning that every action it
 * offered needed a wallet signature anyway. That stopped being true once merchant work
 * moved in: approving a KYB file, recording a deposit and reading a merchant's banking
 * details are all plain HTTP calls that a wallet does not gate.
 *
 * The wallet still matters, and is still separate: this checks WHO you are, the vault
 * checks WHAT you may sign. Staff sign in with a password to reach the console and connect
 * a wallet to act on-chain.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { currentPrincipal } from "@/lib/principal";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/admin/login");

  if (principal.role !== "platform_admin") {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-sm text-ink2">
          This console is for platform staff. Your account belongs to a merchant.
        </p>
        <Link href="/merchant/dashboard" className="btn btn-primary mt-6 inline-block">
          Go to your dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
