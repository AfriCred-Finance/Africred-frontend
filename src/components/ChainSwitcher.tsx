"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { base, baseSepolia, bsc, bscTestnet } from "wagmi/chains";
import { arcTestnet } from "@/lib/contracts";

// BNB entries are deposit *sources*, not places vaults live. They are grouped apart in
// the menu so nobody reads "BNB Chain" as a second deployment of the protocol.
const CHAINS = [
  { id: base.id, name: "Base", testnet: false, source: false },
  { id: baseSepolia.id, name: "Sepolia", testnet: true, source: false },
  // Hosts the settlement vault and nothing else, and is not a bridge source: Arc is
  // outside LayerZero's mesh, so an LP deposits there directly or not at all.
  { id: arcTestnet.id, name: "Arc Testnet", testnet: true, source: false },
  { id: bsc.id, name: "BNB Chain", testnet: false, source: true },
  { id: bscTestnet.id, name: "BNB Testnet", testnet: true, source: true },
] as const;

/// Compact chain switcher. Shows current network; opens a menu to switch.
/// Hidden when no wallet is connected — Nav is less cluttered that way, and
/// switching only matters once you've got a wallet in the door.
export function ChainSwitcher() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!isConnected) return null;

  const current = CHAINS.find((c) => c.id === chainId);
  const label = current?.name ?? "Wrong network";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hairline inline-flex h-9 items-center gap-2 rounded-sm border bg-bg2 px-3 text-[12px] font-medium text-ink transition-colors hover:border-accent"
        aria-expanded={open}
      >
        <span className={`h-2 w-2 rounded-full ${current?.testnet ? "bg-accent" : "bg-positive"}`} />
        <span>{label}</span>
        <svg className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="hairline absolute right-0 top-11 z-50 w-52 rounded-sm border bg-bg2 py-1 shadow-lg">
          {CHAINS.map((c, i) => {
            const active = c.id === chainId;
            const firstSource = c.source && !CHAINS[i - 1]?.source;
            return (
              <div key={`${c.id}-group`}>
                {firstSource && (
                  <div className="hairline mt-1 border-t px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide text-muted">
                    Deposit from
                  </div>
                )}
                <button
                  type="button"
                  disabled={isPending || active}
                  onClick={() => {
                    switchChain({ chainId: c.id });
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-bg3 ${active ? "text-accent" : "text-ink"}`}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${c.testnet ? "bg-accent" : "bg-positive"}`} />
                    <span>{c.name}</span>
                  </span>
                  {active && (
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3 w-3">
                      <path d="M2 6.5L5 9L10 3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
