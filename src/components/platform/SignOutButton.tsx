"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/merchant";

/**
 * Sign out of the console.
 *
 * There was no way out before: the admin pages sit under the product nav, which has no
 * session in it, so a signed-in operator stayed signed in until the cookie expired. On a
 * shared machine that is the whole problem with having added a password in the first place.
 */
export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="text-sm text-ink3 underline transition-colors hover:text-ink2"
      onClick={async () => {
        await signOut();
        // A full navigation, so the server-side guard sees the cleared cookie rather than
        // a client-side route change that keeps the old render.
        router.replace("/admin/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
