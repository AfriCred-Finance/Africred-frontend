import { redirect } from "next/navigation";
import { SignInForm } from "@/components/merchant/SignInForm";
import { currentPrincipal } from "@/lib/principal";

/**
 * The console's own door.
 *
 * Staff used to be redirected to /merchant/login, which greets them as "AfriCred Business",
 * offers to manage their supplier payments and invites them to create an account. All
 * three are wrong for someone whose account was provisioned for them, and a back office
 * that sends its own people through the customers' entrance undermines everything else on
 * the screen.
 *
 * The form itself is the same component the merchant pages and the landing dialog use, so
 * there is one sign-in path in the product, shown three ways. Only the shell and the
 * signup line differ.
 */
export default async function AdminLogin() {
  // Already signed in: no reason to make someone re-enter a password to reach a page they
  // can already open. Staff go through, a merchant is sent to their own side.
  const principal = await currentPrincipal();
  if (principal?.role === "platform_admin") redirect("/admin");
  if (principal) redirect("/merchant/dashboard");

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 text-lg font-semibold tracking-tight text-ink">
        AfriCred <span className="text-ink3">Operations</span>
      </div>
      <div className="card p-6">
        <h1 className="text-xl font-semibold tracking-tight">Staff sign in</h1>
        <p className="mt-1 text-sm text-ink2">
          Credit vaults and settlement operations.
        </p>
        <div className="mt-6">
          <SignInForm allowSignup={false} />
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-muted">
        Merchant accounts sign in at{" "}
        <a href="/merchant/login" className="underline hover:text-ink2">
          /merchant
        </a>
        .
      </p>
    </div>
  );
}
