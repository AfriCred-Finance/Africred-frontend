/**
 * Global disclaimer trigger. Components call `openDisclaimer(target)` when
 * they want to gate a navigation behind the once-per-device disclaimer modal.
 *
 * The <DisclaimerDialog /> mounted in the root layout listens for the event,
 * decides whether to show the modal (first time) or navigate immediately
 * (already accepted), and uses next/navigation's router for SPA transitions.
 */

export const DISCLAIMER_STORAGE_KEY = "africred-disclaimer-accepted";
export const DISCLAIMER_EVENT = "africred-open-disclaimer";

export interface DisclaimerEventDetail {
  target: string;
}

export function openDisclaimer(target: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DISCLAIMER_EVENT, { detail: { target } }));
}

export function resetDisclaimer(): void {
  try {
    localStorage.removeItem(DISCLAIMER_STORAGE_KEY);
  } catch {
    // ignore — storage may be unavailable
  }
}

export function isDisclaimerAccepted(): boolean {
  try {
    return localStorage.getItem(DISCLAIMER_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
