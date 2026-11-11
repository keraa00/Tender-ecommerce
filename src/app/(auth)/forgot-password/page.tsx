import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { requestPasswordResetAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Reset your password" };

const ERRORS: Record<string, string> = {
  "reset-link-expired":
    "That reset link has expired or was already used. Ask for a new one below.",
};

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  const { error, email } = await props.searchParams;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted text-pretty">
        Enter the email you sign in with and we&rsquo;ll send you a link to choose a new
        password.
      </p>

      <ForgotPasswordForm
        action={requestPasswordResetAction}
        email={typeof email === "string" ? email : undefined}
        initialError={typeof error === "string" ? ERRORS[error] : undefined}
      />
    </>
  );
}
