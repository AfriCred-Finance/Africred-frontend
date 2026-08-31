import { SignUpForm } from "@/components/merchant/SignUpForm";

/**
 * Signup as a page.
 *
 * Kept even though the landing page now opens the form in a dialog: this is what a
 * bookmarked or shared /merchant/signup link resolves to, and where anyone arriving from
 * outside the landing page lands. It renders the same <SignUpForm /> the dialog does.
 */
export default function SignupPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-ink2">
        We verify your company before you can send payments. It takes a few hours.
      </p>
      <div className="mt-6">
        <SignUpForm />
      </div>
    </div>
  );
}
