import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { resetPasswordAction, signOutAction } from "@/lib/auth/actions";
import { getCurrentUser, hasFreshRecoverySession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * Where a password-reset link lands, after `/auth/confirm` has signed the user
 * in with it. Anyone else — signed out, or signed in the ordinary way — is
 * sent to ask for a link, so this page never sets a password for a session
 * that did not just come out of the inbox.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (!user || !(await hasFreshRecoverySession())) {
    redirect("/forgot-password?error=reset-link-expired");
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      {/* Naming the account guards against a link someone else sent: it signs
          you in as *them* (SECURITY_AUDIT.md TND-12). */}
      <p className="mt-1.5 mb-6 text-sm text-muted text-pretty">
        For <span className="font-medium text-foreground">{user.email}</span>. Every other
        device signed in to this account will be signed out.
      </p>

      <ResetPasswordForm action={resetPasswordAction} />

      <form action={signOutAction} className="mt-4 text-center text-sm text-muted">
        Not your account?{" "}
        <button
          type="submit"
          className="cursor-pointer font-medium text-foreground underline underline-offset-4"
        >
          Sign out
        </button>
      </form>
    </>
  );
}
