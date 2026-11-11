"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import type { EmailChangeState } from "@/lib/account/actions";

export function EmailForm({
  action,
}: {
  action: (state: EmailChangeState, formData: FormData) => Promise<EmailChangeState>;
}) {
  const [state, formAction, pending] = useActionState<EmailChangeState, FormData>(action, {});

  if (state.notice) {
    return <FormNotice>{state.notice}</FormNotice>;
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError>{state.formError}</FormError>

      <Field label="New email" htmlFor="account-new-email" error={state.fieldErrors?.email}>
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
        label="Current password"
        htmlFor="account-email-password"
        error={state.fieldErrors?.currentPassword}
        hint="So a session left open somewhere can't move your account."
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
        {pending ? "Sending link…" : "Change email"}
      </Button>
    </form>
  );
}
