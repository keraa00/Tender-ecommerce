"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import type { PaymentsFormState } from "@/lib/payments/actions";

/**
 * Starts or resumes Stripe onboarding. A form rather than a link: the action
 * creates the account and a single-use onboarding link on the server, and only
 * then redirects to Stripe.
 *
 * With `countries`, it first asks where the business is based: a new
 * connected account needs its country before it exists, and keeps it for
 * good. Resuming an account's setup asks nothing.
 */
export function ConnectStripeButton({
  action,
  label,
  variant = "primary",
  countries,
  defaultCountry = "",
}: {
  action: (state: PaymentsFormState, formData: FormData) => Promise<PaymentsFormState>;
  label: string;
  variant?: "primary" | "secondary";
  countries?: { code: string; name: string }[];
  defaultCountry?: string;
}) {
  const [state, formAction, pending] = useActionState<PaymentsFormState, FormData>(action, {});
  const countryError = state.fieldErrors?.country;

  return (
    <form action={formAction} className="flex flex-col items-start gap-3">
      {countries ? (
        <div className="w-full max-w-sm space-y-1.5">
          <label htmlFor="stripe-country" className="block text-sm font-medium text-foreground">
            Where is your business based?
          </label>
          <select
            id="stripe-country"
            name="country"
            required
            defaultValue={defaultCountry}
            aria-invalid={Boolean(countryError)}
            aria-describedby={countryError ? "stripe-country-error" : undefined}
            className="h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground aria-[invalid=true]:border-danger"
          >
            <option value="" disabled>
              Choose a country…
            </option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          {countryError ? (
            <p id="stripe-country-error" role="alert" className="text-sm text-danger">
              {countryError}
            </p>
          ) : null}
        </div>
      ) : null}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Opening Stripe…" : label}
      </Button>
      <FormError>{state.formError}</FormError>
    </form>
  );
}
