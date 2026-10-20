"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import type { PaymentsFormState } from "@/lib/payments/actions";

/**
 * Starts or resumes Stripe onboarding. A form rather than a link: the action
 * creates the account and a single-use onboarding link on the server, and only
 * then redirects to Stripe.
 */
export function ConnectStripeButton({
  action,
  label,
  variant = "primary",
}: {
  action: (state: PaymentsFormState, formData: FormData) => Promise<PaymentsFormState>;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState<PaymentsFormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col items-start gap-3">
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Opening Stripe…" : label}
      </Button>
      <FormError>{state.formError}</FormError>
    </form>
  );
}
