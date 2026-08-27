import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { signInAction } from "@/lib/auth/actions";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Log in" };

const LINK_ERRORS: Record<string, string> = {
  "confirmation-link-invalid": "That confirmation link was malformed.",
  "confirmation-link-expired":
    "That confirmation link has expired. Sign in to have a new one sent.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;

  const next = safeRedirectPath(searchParams.next) ?? undefined;

  if (await getCurrentUser()) {
    redirect(next ?? "/dashboard");
  }

  const errorParam = searchParams.error;
  const initialError =
    typeof errorParam === "string" ? LINK_ERRORS[errorParam] : undefined;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted">
        Sign in to manage your store.
      </p>

      <AuthForm
        mode="login"
        action={signInAction}
        next={next}
        initialError={initialError}
      />
    </>
  );
}
