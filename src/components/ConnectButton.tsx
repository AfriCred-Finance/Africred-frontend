"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { shortAddr } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <button className="btn btn-primary" onClick={() => injected && connect({ connector: injected })} disabled={isPending}>
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
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
