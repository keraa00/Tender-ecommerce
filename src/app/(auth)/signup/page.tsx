import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { signUpAction } from "@/lib/auth/actions";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const searchParams = await props.searchParams;

  const next = safeRedirectPath(searchParams.next) ?? undefined;

  if (await getCurrentUser()) {
    redirect(next ?? "/dashboard");
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Create your account
      </h1>
      <p className="mt-1.5 mb-6 text-sm text-muted">
        Then open a store — it takes about a minute.
      </p>

      <AuthForm mode="signup" action={signUpAction} next={next} />
    </>
  );
}
