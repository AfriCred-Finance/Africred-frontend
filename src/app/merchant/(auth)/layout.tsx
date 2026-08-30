/**
 * Shell for sign-in and sign-up.
 *
 * Reachable without a session, unlike everything under (app). A single centred card, no
 * navigation: there is nowhere else to go until you are signed in, and offering links
 * would only invite people to bounce off pages that redirect them straight back.
 */
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/merchant/login" className="mb-8 text-lg font-semibold tracking-tight text-ink">
        AfriCred <span className="text-ink3">Business</span>
      </Link>
      {children}
    </div>
  );
}
