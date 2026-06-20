"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { shortAddr } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, switchChainAsync } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(connector: Connector) {
    setErr(null);
    try {
      const res = await connectAsync({ connector });
      setOpen(false);
      // Auto-switch to Base Sepolia right after connecting. If the wallet doesn't
      // have the chain yet, MetaMask will prompt to add it. User rejection is
      // non-fatal: the manual "Switch to Base Sepolia" button stays as a fallback.
      if (res.chainId !== baseSepolia.id) {
        try {
          await switchChainAsync({ chainId: baseSepolia.id });
        } catch {
          /* user dismissed; banner + manual button remain visible */
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/rejected|denied/i.test(msg)) setErr("Request rejected in your wallet.");
      else setErr("Couldn't connect. Unlock the wallet and try again.");
    }
  }

  if (!isConnected) {
    return (
      <div className="relative">
        <button className="btn btn-primary" onClick={() => setOpen((o) => !o)} disabled={isPending}>
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>

        {open && (
          <>
            {/* click-away backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="card absolute right-0 z-20 mt-2 w-64 p-2 shadow-sm">
              <div className="px-2 py-1.5 text-xs text-muted">Choose a wallet</div>
              {dedupeWallets(connectors).map((c) => (
                <button
                  key={c.uid}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-ink/[0.04]"
                  onClick={() => pick(c)}
                >
                  <WalletIcon connector={c} />
                  <span className="font-medium">{c.name}</span>
                </button>
              ))}
              {dedupeWallets(connectors).length === 0 && (
                <div className="px-2 py-2 text-sm text-muted">
                  No wallet detected. Install MetaMask, Rabby, or Phantom.
                </div>
              )}
              {err && <div className="px-2 py-2 text-xs text-red-700/80">{err}</div>}
            </div>
          </>
        )}
      </div>
    );
  }

  const wrongChain = chainId !== baseSepolia.id;

  return (
    <div className="flex items-center gap-2">
      {wrongChain && (
        <button className="btn" onClick={() => switchChain({ chainId: baseSepolia.id })}>
          Switch to Base Sepolia
        </button>
      )}
      <span className="tag font-mono">{shortAddr(address)}</span>
      <button className="btn" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}

function WalletIcon({ connector }: { connector: Connector }) {
  if (connector.icon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={connector.icon} alt="" className="h-5 w-5 rounded" />;
  }
  return <span className="h-5 w-5 rounded bg-ink/10" />;
}

/** EIP-6963 discovery can surface duplicates + a generic "Injected" entry. Keep one per name and
 *  drop the generic fallback when real, named wallets are present. */
function dedupeWallets(connectors: readonly Connector[]): Connector[] {
  const named = connectors.filter((c) => c.name && c.name.toLowerCase() !== "injected");
  const source = named.length > 0 ? named : connectors;
  const seen = new Set<string>();
  const out: Connector[] = [];
  for (const c of source) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
