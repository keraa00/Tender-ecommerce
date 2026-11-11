"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import type { PasswordChangeState } from "@/lib/account/actions";

export function PasswordForm({
  action,
}: {
  action: (state: PasswordChangeState, formData: FormData) => Promise<PasswordChangeState>;
}) {
  const [state, formAction, pending] = useActionState<PasswordChangeState, FormData>(
    action,
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError>{state.formError}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <Field
        label="Current password"
        htmlFor="password-current"
        error={errors.currentPassword}
      >
        <Input
          id="password-current"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.currentPassword)}
          className="sm:max-w-sm"
        />
      </Field>

      <Field
        label="New password"
        htmlFor="password-new"
        error={errors.newPassword}
        hint="At least 8 characters."
      >
        <Input
          id="password-new"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.newPassword)}
          className="sm:max-w-sm"
        />
      </Field>

      <Field
        label="Confirm new password"
        htmlFor="password-confirm"
        error={errors.confirmPassword}
      >
        <Input
          id="password-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirmPassword)}
          className="sm:max-w-sm"
        />
      </Field>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
