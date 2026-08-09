"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { DEFAULT_CHAIN, HOME_CHAIN_IDS, BRIDGE_SOURCES } from "@/lib/contracts";
import { shortAddr } from "@/lib/format";

/// Every chain the app is configured for: the vault home chains plus the deposit sources.
const KNOWN_CHAIN_IDS: readonly number[] = [...HOME_CHAIN_IDS, ...BRIDGE_SOURCES.map((c) => c.chainId)];

/// How long to wait for wagmi's automatic reconnect before showing the connect menu anyway.
/// Deliberately short: a stuck spinner blocks the user completely, while a premature menu
/// costs at most one harmless click.
const RECONNECT_GRACE_MS = 2_500;

export function ConnectButton() {
  const { address, isConnected, chainId, status } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, switchChainAsync } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Only the automatic mount-time reconnect gets the grace period. A connect the user
  // actually initiated is tracked by `isPending` and should show for as long as it runs.
  const [autoReconnecting, setAutoReconnecting] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAutoReconnecting(false), RECONNECT_GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  async function pick(connector: Connector) {
    setErr(null);
    try {
      const res = await connectAsync({ connector });
      setOpen(false);
      // Only nudge the wallet when it lands on a chain this app knows nothing about.
      // It must NOT force a home chain: BNB Chain is a legitimate place to be, since
      // that is where a cross-chain deposit is signed. Forcing a switch there would
      // drag the user straight back out of the flow they just entered.
      if (!KNOWN_CHAIN_IDS.includes(res.chainId)) {
        try {
          await switchChainAsync({ chainId: DEFAULT_CHAIN.chainId });
        } catch {
          /* user dismissed; the wrong-network prompt stays visible */
        }
      }
    } catch (e) {
      // "Already connected" is not a failure the user can act on: the connection exists and
      // wagmi's state is about to reflect it. Close the menu rather than showing an error
      // and telling them to reload.
      if (/ConnectorAlreadyConnected/i.test((e as { name?: string })?.name ?? "")) {
        setOpen(false);
        return;
      }
      // Keep the real error reachable. The previous catch-all claimed the wallet was locked
      // for every failure, which is a guess that hides the actual cause and sends people
      // chasing the wrong fix.
      console.error("[AfriCred] wallet connect failed:", e);
      setErr(connectErrorMessage(e));
    }
  }

  // The config is `ssr: true`, so wagmi always starts disconnected and reconnects on mount.
  // During that window `isConnected` is false while `status` is "reconnecting", and offering
  // the connect menu invites a click that fails with ConnectorAlreadyConnectedError.
  //
  // But this must NEVER become a dead end. wagmi's reconnect can hang indefinitely on a
  // connector whose provider never answers, and a disabled "Connecting…" with no way out is
  // far worse than a brief flicker. So the wait is time-boxed: after `RECONNECT_GRACE_MS`
  // the connect menu comes back regardless, and clicking it is harmless because
  // "already connected" is handled as a non-error.
  if (autoReconnecting && (status === "reconnecting" || status === "connecting")) {
    return (
      <button className="btn btn-primary" disabled title="Restoring your wallet session">
        Connecting…
      </button>
    );
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
                  // Guarded on `isPending`. Without it a second click lands while the first
                  // connect is still in flight — including the reconnect wagmi fires on
                  // mount — and wallets answer that with "already processing" (-32002),
                  // which then looks like the wallet itself is broken.
                  disabled={isPending}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-ink/[0.04] disabled:opacity-50"
                  onClick={() => pick(c)}
                >
                  <WalletIcon connector={c} />
                  <span className="font-medium">{c.name}</span>
                  {isPending && <span className="ml-auto text-[11px] text-muted">connecting…</span>}
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

  // "Wrong" means a chain this app has no configuration for. Base, Base Sepolia and the
  // BNB deposit-source chains are all valid, so none of them should be nagged about.
  const wrongChain = chainId !== undefined && !KNOWN_CHAIN_IDS.includes(chainId);

  return (
    <div className="flex items-center gap-2">
      {wrongChain && (
        <button className="btn" onClick={() => switchChain({ chainId: DEFAULT_CHAIN.chainId })}>
          Switch to {DEFAULT_CHAIN.chainName}
        </button>
      )}
      <span className="tag font-mono">{shortAddr(address)}</span>
      <button className="btn" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}

/**
 * Turn a connector failure into something actionable, and fall through to the wallet's own
 * message when the case is not recognised. Never invent a cause.
 */
function connectErrorMessage(e: unknown): string {
  const err = e as { name?: string; code?: number; message?: string; shortMessage?: string; details?: string };
  const code = typeof err?.code === "number" ? err.code : undefined;
  const msg = err?.shortMessage || err?.details || err?.message || "";
  const name = err?.name ?? "";

  if (code === 4001 || /rejected|denied/i.test(msg)) {
    return "Request rejected in your wallet.";
  }
  // -32002 means the wallet is still holding an earlier, unanswered prompt. Reloading the
  // page does not clear it, which is exactly why retrying keeps failing the same way.
  if (code === -32002 || /already pending|already processing|request of type/i.test(msg)) {
    return "Your wallet already has a pending request. Open the extension, finish or dismiss it, then try again.";
  }
  if (/ConnectorAlreadyConnected/i.test(name)) {
    return "Already connected — reload the page.";
  }
  if (/ProviderNotFound/i.test(name) || /provider not found|no provider/i.test(msg)) {
    return "That wallet did not respond. Check it is enabled for this site.";
  }
  if (/locked/i.test(msg)) {
    return "The wallet is locked. Unlock it and try again.";
  }
  return msg ? `Could not connect: ${msg.split("\n")[0]}` : "Could not connect (see the browser console for details).";
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
