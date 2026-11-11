"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import type { ResetPasswordState } from "@/lib/auth/actions";

export function ResetPasswordForm({
  action,
}: {
  action: (state: ResetPasswordState, formData: FormData) => Promise<ResetPasswordState>;
}) {
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError>{state.formError}</FormError>

      <Field
        label="New password"
        htmlFor="newPassword"
        error={errors.newPassword}
        hint="At least 8 characters."
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors.newPassword)}
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword}>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors.confirmPassword)}
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
