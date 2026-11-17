"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import type { EmailChangeState } from "@/lib/account/actions";
import type { AdminMessages } from "@/lib/i18n/admin";

export function EmailForm({
  action,
  t,
}: {
  action: (state: EmailChangeState, formData: FormData) => Promise<EmailChangeState>;
  t: AdminMessages["account"]["forms"];
}) {
  const [state, formAction, pending] = useActionState<EmailChangeState, FormData>(action, {});

  if (state.notice) {
    return <FormNotice>{state.notice}</FormNotice>;
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError>{state.formError}</FormError>

      <Field label={t.newEmail} htmlFor="account-new-email" error={state.fieldErrors?.email}>
        <Input
          id="account-new-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          className="sm:max-w-sm"
        />
      </Field>

      <Field
        label={t.currentPassword}
        htmlFor="account-email-password"
        error={state.fieldErrors?.currentPassword}
        hint={t.currentPasswordHint}
      >
        <Input
          id="account-email-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(state.fieldErrors?.currentPassword)}
          className="sm:max-w-sm"
        />
      </Field>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t.sendingLink : t.changeEmail}
      </Button>
    </form>
  );
}
