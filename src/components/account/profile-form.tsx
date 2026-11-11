"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import type { ProfileState } from "@/lib/account/actions";
import { NAME_MAX_LENGTH } from "@/lib/auth/schemas";

export function ProfileForm({
  action,
  name: initialName,
}: {
  action: (state: ProfileState, formData: FormData) => Promise<ProfileState>;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(action, {});
  // Controlled: React resets a form after its action runs, which would put a
  // rejected name back to the saved one and lose what was typed.
  const [name, setName] = useState(initialName);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError>{state.formError}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <Field
        label="Name"
        htmlFor="account-name"
        error={state.fieldErrors?.name}
        hint="Shown in the header and to anyone you work alongside in a store."
      >
        <Input
          id="account-name"
          name="name"
          autoComplete="name"
          maxLength={NAME_MAX_LENGTH}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          className="sm:max-w-sm"
        />
      </Field>

      <Button type="submit" size="sm" disabled={pending || name.trim() === initialName}>
        {pending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}
