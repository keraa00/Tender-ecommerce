"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import type { PasswordChangeState } from "@/lib/account/actions";
import type { AdminMessages } from "@/lib/i18n/admin";

export function PasswordForm({
  action,
  t,
}: {
  action: (state: PasswordChangeState, formData: FormData) => Promise<PasswordChangeState>;
  t: AdminMessages["account"]["forms"];
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
        label={t.currentPassword}
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
        label={t.newPassword}
        htmlFor="password-new"
        error={errors.newPassword}
        hint={t.newPasswordHint}
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
        label={t.confirmPassword}
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
        {pending ? t.updating : t.updatePassword}
      </Button>
    </form>
  );
}
