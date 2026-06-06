import Link from "next/link";
import { ConnectButton } from "./ConnectButton";

export function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-5 w-5 rounded-md bg-ink" />
            <span className="text-sm font-semibold tracking-tight">AfriCred</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted">
            <Link href="/vaults" className="hover:text-ink">
              Vaults
            </Link>
            <Link href="/admin" className="hover:text-ink">
              Admin
            </Link>
          </nav>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
