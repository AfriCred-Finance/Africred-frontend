"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DISCLAIMER_EVENT,
  DISCLAIMER_STORAGE_KEY,
  type DisclaimerEventDetail,
} from "@/lib/disclaimer";

/**
 * Singleton disclaimer dialog. Mounted once in the root layout. Listens for
 * the `africred-open-disclaimer` event:
 *
 * - if the user already accepted (localStorage flag), pushes to the target
 *   immediately without showing the modal.
 * - otherwise opens the modal; on accept persists the flag and pushes.
 *
 * Built without Headless UI so we don't add a dependency for one component.
 * Close interactions: Escape, backdrop click, Cancel button.
 */
export function DisclaimerDialog() {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<DisclaimerEventDetail>).detail;
      const t = detail?.target ?? "/vaults";
      try {
        if (localStorage.getItem(DISCLAIMER_STORAGE_KEY) === "true") {
          router.push(t);
          return;
        }
      } catch {
        // fall through and show the modal if storage isn't available
      }
      setTarget(t);
    }
    window.addEventListener(DISCLAIMER_EVENT, handler);
    return () => window.removeEventListener(DISCLAIMER_EVENT, handler);
  }, [router]);

  useEffect(() => {
    if (target === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTarget(null);
    }
    // Disable page scroll while the dialog is open
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [target]);

  if (target === null) return null;

  const close = () => setTarget(null);

  const accept = () => {
    try {
      localStorage.setItem(DISCLAIMER_STORAGE_KEY, "true");
    } catch {
      // ignore quota / disabled storage
    }
    const t = target;
    setTarget(null);
    if (t) router.push(t);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="africred-disclaimer-title"
      className="fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={close}
    >
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[4px]" />
      <div
        className="hairline2 relative w-full max-w-[560px] rounded border bg-bg2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hairline flex items-center border-b px-6 py-4">
          <div id="africred-disclaimer-title" className="text-sm font-medium text-ink">
            Disclaimer
          </div>
        </div>
        <div className="space-y-3 px-6 py-5 text-[13.5px] leading-[1.65] text-ink2">
          <p>
            By accessing or using the AfriCred decentralized application (dApp), you confirm that you are{" "}
            <strong className="font-medium text-ink">not a United States person</strong> and are not acting on behalf of
            any entity organized or established under United States law.
          </p>
          <p>
            This application is in active development on the Base Sepolia testnet. The vaults you fund are linked to
            real SME loans whose performance carries credit risk. Features, performance, and the user experience may
            evolve over time.
          </p>
          <p>
            AfriCred relies on smart contracts and integrates with third-party infrastructure including LayerZero, IPFS
            pinning services, and RPC providers. Users are exposed to risks associated with these external
            dependencies.
          </p>
          <p>
            All interactions with the protocol are at your own risk. AfriCred and its contributors cannot be held
            liable for any loss of funds resulting from the use of the application.
          </p>
        </div>
        <div className="hairline flex items-center justify-end gap-2 border-t bg-bg/40 px-6 py-3">
          <button
            type="button"
            onClick={close}
            className="btn-secondary inline-flex h-9 items-center rounded-sm px-4 text-[12px] font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={accept}
            className="btn-primary inline-flex h-9 items-center rounded-sm px-4 text-[12px] font-medium"
          >
            I understand — continue
          </button>
        </div>
      </div>
    </div>
  );
}
