"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/merchant";

/**
 * The merchant's own navigation.
 *
 * Four destinations and a sign-out. No wallet, no network, no mention of a chain: the
 * words here are the ones a trader uses, because that is who reads them.
 */
const LINKS = [
  { href: "/merchant/dashboard", label: "Overview" },
  { href: "/merchant/operations", label: "Payments" },
  { href: "/merchant/clients", label: "Clients" },
  { href: "/merchant/deposits", label: "Deposits" },
] as const;

export function MerchantHeader({ email }: { email: string }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  async function leave() {
    await signOut();
    // A full navigation, so the server-side guard sees the cleared cookie rather than a
    // client-side route change that keeps the old render.
    router.replace("/merchant/login");
    router.refresh();
  }

  return (
    <header className="hairline sticky top-0 z-30 border-b bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-content items-center gap-6 px-6 lg:px-12">
        <Link href="/merchant/dashboard" className="font-semibold tracking-tight text-ink">
          AfriCred <span className="text-ink3">Business</span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm sm:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                pathname.startsWith(l.href) ? "text-ink" : "text-ink3 transition-colors hover:text-ink2"
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <span className="hidden text-sm text-ink3 sm:inline">{email}</span>
          <button type="button" onClick={leave} className="btn btn-ghost">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
