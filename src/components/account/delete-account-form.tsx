"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import type { DeleteAccountState } from "@/lib/account/actions";

export function DeleteAccountForm({
  action,
  email,
}: {
  action: (state: DeleteAccountState, formData: FormData) => Promise<DeleteAccountState>;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(action, {});
  const [typed, setTyped] = useState("");
  const errors = state.fieldErrors ?? {};
  const confirmed = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError>{state.formError}</FormError>

      <Field
        label={`Type ${email} to confirm`}
        htmlFor="delete-account-email"
        error={errors.confirmEmail}
      >
        <Input
          id="delete-account-email"
          name="confirmEmail"
          type="email"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-invalid={Boolean(errors.confirmEmail)}
          className="sm:max-w-sm"
        />
      </Field>

      <Field label="Current password" htmlFor="delete-account-password" error={errors.currentPassword}>
        <Input
          id="delete-account-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.currentPassword)}
          className="sm:max-w-sm"
        />
      </Field>

      <Button type="submit" variant="danger" size="sm" disabled={pending || !confirmed}>
        {pending ? "Deleting…" : "Delete my account permanently"}
      </Button>
    </form>
  );
}
