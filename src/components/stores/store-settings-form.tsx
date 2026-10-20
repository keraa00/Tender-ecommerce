"use client";

import { useActionState, useState } from "react";

import { SaveBar, useDiscard, useResyncAfterReset } from "@/components/admin/save-bar";
import { KEEP_LOGO, LogoField, type LogoChoice } from "@/components/stores/logo-field";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import type { StoreSettingsState } from "@/lib/stores/actions";

type StoreSettingsFormProps = {
  action: (state: StoreSettingsState, formData: FormData) => Promise<StoreSettingsState>;
  store: {
    name: string;
    logoUrl: string | null;
    accentColor: string | null;
    currency: string;
    contactEmail: string | null;
  };
  /** Labelled on the server: `Intl` names differ between Node and browsers. */
  currencies: { code: string; label: string }[];
  /** Set once the store has taken an order; says why the currency is fixed. */
  currencyLocked: boolean;
  /** Shown as the contact email's fallback. */
  ownerEmail: string;
};

export function StoreSettingsForm(props: StoreSettingsFormProps) {
  const { key, discard } = useDiscard();
  return <StoreSettingsFormBody key={key} {...props} onDiscard={discard} />;
}

function StoreSettingsFormBody({
  action,
  store,
  currencies,
  currencyLocked,
  ownerEmail,
  onDiscard,
}: StoreSettingsFormProps & { onDiscard: () => void }) {
  const [state, formAction, pending] = useActionState<StoreSettingsState, FormData>(
    action,
    {},
  );
  const [logo, setLogo] = useState<LogoChoice>(KEEP_LOGO);
  // Controlled, so an error reply keeps what was typed: React resets
  // uncontrolled fields once a form action settles.
  const [currency, setCurrency] = useState(store.currency);
  const [contactEmail, setContactEmail] = useState(store.contactEmail ?? "");
  const errors = state.fieldErrors ?? {};
  const resync = useResyncAfterReset();

  // A save re-renders the page with the stored logo as `store.logoUrl`, so the
  // choice that produced it is spent. An error keeps it, to try again.
  const [settled, setSettled] = useState(state);
  if (state !== settled) {
    setSettled(state);
    if (state.notice) setLogo(KEEP_LOGO);
  }

  return (
    <form action={formAction} className="space-y-8" noValidate {...resync}>
      <SaveBar
        label="Save changes"
        pending={pending}
        onDiscard={onDiscard}
        savedKey={state.notice ? state : undefined}
      />

      <FormError>{state.formError}</FormError>

      {state.notice ? (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
        >
          {state.notice}
        </p>
      ) : null}

      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <h2 className="text-sm font-medium tracking-tight">Store mark</h2>
          <p className="mt-0.5 text-sm text-muted text-pretty">
            How your store is marked in your store list and across this admin. Buyers
            see it at the top of checkout.
          </p>
        </div>
        <LogoField
          storeName={store.name}
          accentColor={store.accentColor}
          current={store.logoUrl}
          value={logo}
          onChange={setLogo}
          error={errors.logo}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-medium tracking-tight">Store details</h2>

        <Field
          label="Currency"
          htmlFor="settings-currency"
          error={errors.currency}
          hint={
            currencyLocked
              ? "Fixed now that your store has taken orders, so every total in your history adds up in one currency."
              : "Every price, shipping rate and discount amount is in this currency. Prices are not converted when it changes — 24.99 stays 24.99."
          }
        >
          {/* A disabled select posts nothing, so the current value rides
              along in a hidden field and the server sees no change. */}
          {currencyLocked ? <input type="hidden" name="currency" value={store.currency} /> : null}
          <Select
            id="settings-currency"
            name={currencyLocked ? undefined : "currency"}
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            disabled={currencyLocked}
            aria-invalid={Boolean(errors.currency)}
            className="sm:max-w-xs"
          >
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Customer contact email"
          htmlFor="settings-contact-email"
          error={errors.contactEmail}
          hint={`Shown to buyers at checkout and on your contact page. Leave it empty to use ${ownerEmail}.`}
        >
          <Input
            id="settings-contact-email"
            name="contactEmail"
            type="email"
            autoComplete="off"
            maxLength={254}
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder={ownerEmail}
            aria-invalid={Boolean(errors.contactEmail)}
            className="sm:max-w-sm"
          />
        </Field>
      </section>
    </form>
  );
}
