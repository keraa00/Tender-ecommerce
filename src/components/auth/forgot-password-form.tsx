"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import type { ForgotPasswordState } from "@/lib/auth/actions";

export function ForgotPasswordForm({
  action,
  email,
  initialError,
}: {
  action: (state: ForgotPasswordState, formData: FormData) => Promise<ForgotPasswordState>;
  email?: string;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState<ForgotPasswordState, FormData>(
    action,
    initialError ? { formError: initialError } : {},
  );

  if (state.notice) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle px-5 py-6 text-center">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1.5 text-sm text-muted text-pretty">{state.notice}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError>{state.formError}</FormError>

      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email ?? email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
