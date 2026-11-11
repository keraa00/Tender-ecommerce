"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormError, FormNotice } from "@/components/ui/field";
import type { SessionsState } from "@/lib/account/actions";

export function SignOutOthersForm({
  action,
  disabled,
}: {
  action: (state: SessionsState, formData: FormData) => Promise<SessionsState>;
  /** Nothing to sign out of: this is the only session. */
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<SessionsState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <FormError>{state.formError}</FormError>
      <FormNotice>{state.notice}</FormNotice>
      <Button type="submit" variant="secondary" size="sm" disabled={pending || disabled}>
        {pending ? "Signing out…" : "Sign out of all other devices"}
      </Button>
    </form>
  );
}
