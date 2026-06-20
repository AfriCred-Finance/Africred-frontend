"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "./ConnectButton";
import { ThemeToggle } from "./ThemeToggle";
import { openDisclaimer } from "@/lib/disclaimer";

export function Nav() {
  const pathname = usePathname() ?? "/";
  const [openDropdown, setOpenDropdown] = useState<null | "products" | "resources">(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click or Escape
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenDropdown(null);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Auto-close dropdowns when navigating to a new route
  useEffect(() => {
    setOpenDropdown(null);
  }, [pathname]);

  const toggle = (name: "products" | "resources") =>
    setOpenDropdown((cur) => (cur === name ? null : name));

  const productsActive = pathname.startsWith("/vaults") || pathname.startsWith("/borrow");
  const isLanding = pathname === "/";

  return (
    <header className="hairline sticky top-0 z-30 border-b bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-6 px-6 lg:px-12">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image
            src="/africred-logo.png"
            alt="AfriCred"
            width={36}
            height={36}
            priority
            className="h-8 w-8"
          />
          <span className="text-sm font-semibold tracking-tight">AfriCred</span>
        </Link>

        <nav ref={navRef} className="hidden items-center gap-2 text-[13px] lg:flex">
          <ProductsMenu
            open={openDropdown === "products"}
            active={productsActive}
            onToggle={() => toggle("products")}
          />
          <ResourcesMenu
            open={openDropdown === "resources"}
            onToggle={() => toggle("resources")}
          />
          <Link
            href="/admin"
            className={`menu-btn ${pathname.startsWith("/admin") ? "active" : ""}`}
          >
            Admin
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isLanding ? (
            <button
              type="button"
              onClick={() => openDisclaimer("/vaults")}
              className="btn-accent inline-flex h-9 items-center rounded-sm px-5 text-[13px] font-medium"
            >
              Earn yield
            </button>
          ) : (
            <ConnectButton />
          )}
        </div>
      </div>
    </header>
  );
}

interface MenuProps {
  open: boolean;
  active?: boolean;
  onToggle: () => void;
}

function Chevron() {
  return (
    <svg className="chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProductsMenu({ open, active, onToggle }: MenuProps) {
  return (
    <div className={`menu ${open ? "open" : ""}`}>
      <button type="button" className={`menu-btn ${active ? "active" : ""}`} onClick={onToggle} aria-expanded={open}>
        Products
        <Chevron />
      </button>
      <div className="menu-panel">
        <Link href="/vaults" className="menu-item">
          <span>Vaults</span>
          <span className="ext">→</span>
        </Link>
        <Link href="/borrow" className="menu-item">
          <span>Apply for a loan</span>
          <span className="ext">→</span>
        </Link>
      </div>
    </div>
  );
}

function ResourcesMenu({ open, onToggle }: MenuProps) {
  return (
    <div className={`menu ${open ? "open" : ""}`}>
      <button type="button" className="menu-btn" onClick={onToggle} aria-expanded={open}>
        Resources
        <Chevron />
      </button>
      <div className="menu-panel">
        <div className="menu-section-label">Documentation</div>
        <a
          href="https://github.com/africred"
          target="_blank"
          rel="noopener noreferrer"
          className="menu-item"
        >
          <span>GitHub</span>
          <span className="ext">↗</span>
        </a>
        <div className="menu-divider" />
        <div className="menu-section-label">About</div>
        <Link href="/" className="menu-item">
          <span>Overview</span>
          <span className="ext">→</span>
        </Link>
      </div>
    </div>
  );
}
