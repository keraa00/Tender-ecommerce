"use client";

import { useActionState, useState } from "react";

import { SaveBar, useDiscard, useResyncAfterReset } from "@/components/admin/save-bar";
import { FormError } from "@/components/ui/field";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { CheckoutSettingsState } from "@/lib/stores/actions";
import { CHECKOUT_FIELD_MODES, type CheckoutSettings } from "@/lib/stores/settings-form";

type Props = {
  action: (state: CheckoutSettingsState, formData: FormData) => Promise<CheckoutSettingsState>;
  settings: CheckoutSettings;
  t: AdminMessages["settings"]["checkout"];
  saveLabel: string;
};

/** Each field, in the order checkout shows them. */
const FIELDS: readonly (keyof typeof CHECKOUT_FIELD_MODES)[] = [
  "checkoutFirstName",
  "checkoutCompany",
  "checkoutAddress2",
  "checkoutPhone",
];

/**
 * Settings → Checkout. Radios rather than selects, so every option for a
 * field is visible at once and the choice reads at a glance.
 */
export function CheckoutSettingsForm(props: Props) {
  const { key, discard } = useDiscard();
  return <CheckoutSettingsFormBody key={key} {...props} onDiscard={discard} />;
}

function CheckoutSettingsFormBody({
  action,
  settings,
  t,
  saveLabel,
  onDiscard,
}: Props & { onDiscard: () => void }) {
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
        label={saveLabel}
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
          <h2 className="text-sm font-medium tracking-tight">{t.customerInformation}</h2>
          <p className="mt-0.5 text-sm text-muted text-pretty">{t.customerInformationHint}</p>
        </div>

        <ul className="divide-y divide-border">
          {FIELDS.map((name) => (
            <li key={name} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p id={`${name}-label`} className="text-sm font-medium">
                  {t.fields[name].label}
                </p>
                <p className="text-xs text-muted">{t.fields[name].hint}</p>
                {errors[name] ? (
                  <p role="alert" className="mt-1 text-sm text-danger">
                    {errors[name]}
                  </p>
                ) : null}
              </div>
              <div
                role="radiogroup"
                aria-labelledby={`${name}-label`}
                className="flex shrink-0 flex-wrap gap-1.5"
              >
                {CHECKOUT_FIELD_MODES[name].map((mode) => (
                  <label
                    key={mode}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm has-checked:border-foreground has-checked:bg-surface-hover"
                  >
                    <input
                      type="radio"
                      name={name}
                      value={mode}
                      checked={values[name] === mode}
                      onChange={() => setValues((current) => ({ ...current, [name]: mode }))}
                    />
                    {t.modes[mode]}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-medium tracking-tight">{t.extras}</h2>
        <Toggle
          name="checkoutMarketingOptIn"
          checked={values.checkoutMarketingOptIn}
          onChange={(checked) => setValues((current) => ({ ...current, checkoutMarketingOptIn: checked }))}
          label={t.marketing}
          hint={t.marketingHint}
        />
        <Toggle
          name="checkoutOrderNote"
          checked={values.checkoutOrderNote}
          onChange={(checked) => setValues((current) => ({ ...current, checkoutOrderNote: checked }))}
          label={t.orderNote}
          hint={t.orderNoteHint}
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
