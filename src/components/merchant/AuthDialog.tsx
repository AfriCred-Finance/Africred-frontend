"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";

/**
 * Sign-in and signup as an overlay on the merchant landing page.
 *
 * A visitor who clicks "Sign in" or "Create account" wants a form, not a page change.
 * Sending them elsewhere loses the page they were reading and turns coming back into a
 * browser-back problem. The dialog keeps the landing page underneath.
 *
 * One dialog holds both forms and swaps between them, so "No account yet? Create one" is
 * an in-place switch rather than a close followed by a navigation. Whichever button opened
 * the box only decides which form shows first.
 *
 * /merchant/login and /merchant/signup stay real pages on purpose: the first is where the
 * (app) layout guard sends anyone without a session, and both are what a bookmark or a
 * shared link resolves to. They render the same two form components this does.
 *
 * Built without a dialog library, matching <DisclaimerDialog />: Escape, backdrop click
 * and a close button, scroll locked while open, focus moved in on open and handed back to
 * the trigger on close.
 */

type Mode = "signin" | "signup";

interface ButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function SignInButton({ className, children = "Sign in" }: ButtonProps) {
  return (
    <AuthButton mode="signin" className={className}>
      {children}
    </AuthButton>
  );
}

export function CreateAccountButton({ className, children = "Create account" }: ButtonProps) {
  return (
    <AuthButton mode="signup" className={className}>
      {children}
    </AuthButton>
  );
}

function AuthButton({ mode, className, children }: ButtonProps & { mode: Mode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    // Without this the focus ring lands back on <body> and a keyboard user restarts at the
    // top of the page.
    trigger.current?.focus();
  }, []);

  return (
    <>
      <button ref={trigger} type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <AuthDialog initialMode={mode} onClose={close} />}
    </>
  );
}

const COPY: Record<Mode, { title: string; subtitle: string; width: string }> = {
  signin: {
    title: "Sign in",
    subtitle: "Manage your supplier payments.",
    width: "max-w-[420px]",
  },
  signup: {
    title: "Create your account",
    subtitle: "We verify your company before you can send payments. It takes a few hours.",
    // Ten fields in a two-column grid; the sign-in width would stack them into a column
    // taller than most screens.
    width: "max-w-[620px]",
  },
};

function AuthDialog({ initialMode, onClose }: { initialMode: Mode; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const panel = useRef<HTMLDivElement>(null);
  const copy = COPY[mode];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Keep Tab inside the dialog. Without it, tabbing walks into the landing page behind
      // the backdrop, where nothing is visibly focused.
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="merchant-auth-title"
      className="fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[4px]" />
      <div
        ref={panel}
        className={`hairline2 relative flex max-h-[90vh] w-full ${copy.width} flex-col rounded border bg-bg2`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-6 pb-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 text-ink3 transition-colors hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>

          <h2 id="merchant-auth-title" className="pr-8 text-xl font-semibold tracking-tight">
            {copy.title}
          </h2>
          <p className="mt-1 text-sm text-ink2">{copy.subtitle}</p>
        </div>

        {/*
          The signup form is taller than a short viewport, so the body scrolls and the
          header stays put. Otherwise the submit button ends up below the fold with no way
          to reach it.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-6">
          {mode === "signin" ? (
            <SignInForm
              key="signin"
              autoFocus
              onSuccess={onClose}
              onSwitchToSignup={() => setMode("signup")}
            />
          ) : (
            <SignUpForm
              key="signup"
              autoFocus
              onSuccess={onClose}
              onSwitchToSignIn={() => setMode("signin")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
