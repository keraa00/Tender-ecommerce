"use client";

import { useActionState, useState } from "react";

import { SaveBar, useDiscard, useResyncAfterReset } from "@/components/admin/save-bar";
import { FormError } from "@/components/ui/field";
import type { CheckoutSettingsState } from "@/lib/stores/actions";
import { CHECKOUT_FIELD_MODES, type CheckoutSettings } from "@/lib/stores/settings-form";

type Props = {
  action: (state: CheckoutSettingsState, formData: FormData) => Promise<CheckoutSettingsState>;
  settings: CheckoutSettings;
};

const MODE_LABELS = {
  HIDDEN: "Don't ask",
  OPTIONAL: "Optional",
  REQUIRED: "Required",
} as const;

/** Each field with what it asks, in the order checkout shows them. */
const FIELDS: {
  name: keyof typeof CHECKOUT_FIELD_MODES;
  label: string;
  hint: string;
}[] = [
  {
    name: "checkoutFirstName",
    label: "First name",
    hint: "The last name is always required.",
  },
  {
    name: "checkoutCompany",
    label: "Company name",
    hint: "For buyers ordering on behalf of a business.",
  },
  {
    name: "checkoutAddress2",
    label: "Address line 2",
    hint: "Apartment, suite, unit or floor.",
  },
  {
    name: "checkoutPhone",
    label: "Phone number",
    hint: "Couriers often want one to arrange delivery.",
  },
];

/**
 * Settings → Checkout. Radios rather than selects, so every option for a
 * field is visible at once and the choice reads at a glance.
 */
export function CheckoutSettingsForm(props: Props) {
  const { key, discard } = useDiscard();
  return <CheckoutSettingsFormBody key={key} {...props} onDiscard={discard} />;
}

function CheckoutSettingsFormBody({ action, settings, onDiscard }: Props & { onDiscard: () => void }) {
  const [state, formAction, pending] = useActionState<CheckoutSettingsState, FormData>(
    action,
    {},
  );
  const errors = state.fieldErrors ?? {};
  const resync = useResyncAfterReset();
  // Controlled, so React's reset of uncontrolled fields after the action
  // settles never flips a choice back while the page catches up.
  const [values, setValues] = useState(settings);

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

      <section className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-5">
          <h2 className="text-sm font-medium tracking-tight">Customer information</h2>
          <p className="mt-0.5 text-sm text-muted text-pretty">
            What buyers are asked for alongside their address. Email, address, city and
            country are always required; the postal code and region follow each
            country&apos;s own rules.
          </p>
        </div>

        <ul className="divide-y divide-border">
          {FIELDS.map((field) => (
            <li key={field.name} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p id={`${field.name}-label`} className="text-sm font-medium">
                  {field.label}
                </p>
                <p className="text-xs text-muted">{field.hint}</p>
                {errors[field.name] ? (
                  <p role="alert" className="mt-1 text-sm text-danger">
                    {errors[field.name]}
                  </p>
                ) : null}
              </div>
              <div
                role="radiogroup"
                aria-labelledby={`${field.name}-label`}
                className="flex shrink-0 flex-wrap gap-1.5"
              >
                {CHECKOUT_FIELD_MODES[field.name].map((mode) => (
                  <label
                    key={mode}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm has-checked:border-foreground has-checked:bg-surface-hover"
                  >
                    <input
                      type="radio"
                      name={field.name}
                      value={mode}
                      checked={values[field.name] === mode}
                      onChange={() => setValues((current) => ({ ...current, [field.name]: mode }))}
                    />
                    {MODE_LABELS[mode]}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-medium tracking-tight">Extras</h2>
        <Toggle
          name="checkoutMarketingOptIn"
          checked={values.checkoutMarketingOptIn}
          onChange={(checked) => setValues((current) => ({ ...current, checkoutMarketingOptIn: checked }))}
          label="Email marketing sign-up"
          hint="A checkbox under the email field, unticked by default. Each order records whether it was ticked."
        />
        <Toggle
          name="checkoutOrderNote"
          checked={values.checkoutOrderNote}
          onChange={(checked) => setValues((current) => ({ ...current, checkoutOrderNote: checked }))}
          label="Order note"
          hint="A free-text box for gift messages or delivery instructions, shown on the order."
        />
      </section>
    </form>
  );
}

function Toggle({
  name,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted text-pretty">{hint}</span>
      </span>
    </label>
  );
}
