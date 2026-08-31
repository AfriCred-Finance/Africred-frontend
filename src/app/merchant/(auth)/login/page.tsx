import { SignInForm } from "@/components/merchant/SignInForm";

/**
 * Sign-in as a page.
 *
 * Kept even though the landing page now opens the form in a dialog: this is where the
 * (app) layout guard redirects anyone without a session, and what a bookmarked or shared
 * /merchant/login link resolves to. It renders the same <SignInForm /> the dialog does.
 */
export default function LoginPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-ink2">Manage your supplier payments.</p>
      <div className="mt-6">
        <SignInForm />
      </div>
    </div>
  );
}
