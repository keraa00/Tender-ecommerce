"use client";

import { useActionState, useState, type ReactNode } from "react";

import { SaveBar, useDiscard, useResyncAfterReset } from "@/components/admin/save-bar";
import { Field, FormError, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { RateFormState } from "@/lib/shipping/actions";
import { MAX_DELIVERY_DAYS, MAX_RATE_NAME, type RateCondition } from "@/lib/shipping/form";

/** Field values as typed. Money and kilograms are strings until the server parses them. */
export type RateFormValues = {
  name: string;
  price: string;
  minDays: string;
  maxDays: string;
  condition: RateCondition;
  minSubtotal: string;
  maxSubtotal: string;
  minWeight: string;
  maxWeight: string;
};

export const BLANK_RATE: RateFormValues = {
  name: "",
  price: "",
  minDays: "",
  maxDays: "",
  condition: "none",
  minSubtotal: "",
  maxSubtotal: "",
  minWeight: "",
  maxWeight: "",
};

type RateFormProps = {
  action: (state: RateFormState, formData: FormData) => Promise<RateFormState>;
  initialValues: RateFormValues;
  /** The store currency's symbol, for the price fields. */
  currencySymbol: string;
  submitLabel: string;
  t: AdminMessages["settings"]["shipping"]["rateForm"];
};

const CONDITIONS: readonly RateCondition[] = ["none", "subtotal", "weight"];

export function RateForm(props: RateFormProps) {
  const { key, discard } = useDiscard();
  return <RateFormBody key={key} {...props} onDiscard={discard} />;
}

function RateFormBody({
  action,
  initialValues,
  currencySymbol,
  submitLabel,
  t,
  onDiscard,
}: RateFormProps & { onDiscard: () => void }) {
  const [state, formAction, pending] = useActionState<RateFormState, FormData>(action, {});
  // Controlled throughout: React resets a form's uncontrolled fields once its
  // action settles, which would wipe what the seller typed whenever the
  // answer is an error.
  const [values, setValues] = useState(initialValues);
  const errors = state.fieldErrors ?? {};
  const resync = useResyncAfterReset();
  const set = (key: keyof RateFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const condition = values.condition;

  return (
    <form action={formAction} className="space-y-6" noValidate {...resync}>
      <SaveBar
        label={submitLabel}
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
        <Field
          label={t.name}
          htmlFor="rate-name"
          error={errors.name}
          hint={t.nameHint}
        >
          <Input
            id="rate-name"
            name="name"
            maxLength={MAX_RATE_NAME}
            value={values.name}
            onChange={(event) => set("name")(event.target.value)}
            placeholder={t.namePlaceholder}
            aria-invalid={Boolean(errors.name)}
            className="sm:max-w-sm"
          />
        </Field>

        <Field label={t.price} htmlFor="rate-price" error={errors.price} hint={t.priceHint}>
          <Affixed prefix={currencySymbol} className="max-w-40">
            <input
              id="rate-price"
              name="price"
              inputMode="decimal"
              value={values.price}
              onChange={(event) => set("price")(event.target.value)}
              placeholder="0.00"
              aria-invalid={Boolean(errors.price)}
              className="h-10 w-full min-w-0 bg-transparent px-2 text-sm outline-none"
            />
          </Affixed>
        </Field>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{t.delivery}</legend>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <DaysInput
              name="minDays"
              label={format(t.daysLabel, { label: t.shortest })}
              value={values.minDays}
              onChange={set("minDays")}
              invalid={Boolean(errors.delivery)}
            />
            <span className="text-muted">{t.to}</span>
            <DaysInput
              name="maxDays"
              label={format(t.daysLabel, { label: t.longest })}
              value={values.maxDays}
              onChange={set("maxDays")}
              invalid={Boolean(errors.delivery)}
            />
            <span className="text-muted">{t.businessDays}</span>
          </div>
          {errors.delivery ? (
            <p role="alert" className="text-sm text-danger">
              {errors.delivery}
            </p>
          ) : (
            <p className="text-sm text-muted">{t.deliveryHint}</p>
          )}
        </fieldset>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <h2 className="text-sm font-medium tracking-tight">{t.condition}</h2>
          <p className="mt-0.5 text-sm text-muted text-pretty">{t.conditionHint}</p>
        </div>

        <div role="radiogroup" aria-label={t.condition} className="grid gap-2 sm:grid-cols-3">
          {CONDITIONS.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border-strong bg-surface px-3 py-2.5 has-checked:border-foreground has-checked:bg-surface-hover"
            >
              <input
                type="radio"
                name="condition"
                value={option}
                checked={condition === option}
                onChange={() => setValues((current) => ({ ...current, condition: option }))}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t.conditions[option].label}</span>
                <span className="block text-xs text-muted">{t.conditions[option].hint}</span>
              </span>
            </label>
          ))}
        </div>

        {/* Both ranges stay mounted, so flipping between them keeps what was
            typed; the parser reads only the chosen one. */}
        <div className={cn(condition !== "subtotal" && "hidden")}>
          <Range
            prefix={currencySymbol}
            names={["minSubtotal", "maxSubtotal"]}
            values={[values.minSubtotal, values.maxSubtotal]}
            onChange={[set("minSubtotal"), set("maxSubtotal")]}
            placeholder="0.00"
            invalid={Boolean(errors.condition)}
            t={t}
          />
        </div>
        <div className={cn(condition !== "weight" && "hidden")}>
          <Range
            suffix="kg"
            names={["minWeight", "maxWeight"]}
            values={[values.minWeight, values.maxWeight]}
            onChange={[set("minWeight"), set("maxWeight")]}
            placeholder="0"
            invalid={Boolean(errors.condition)}
            t={t}
          />
        </div>
        {errors.condition ? (
          <p role="alert" className="text-sm text-danger">
            {errors.condition}
          </p>
        ) : null}
      </section>
    </form>
  );
}

function DaysInput({
  name,
  label,
  value,
  onChange,
  invalid,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  return (
    <input
      name={name}
      aria-label={label}
      inputMode="numeric"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      maxLength={String(MAX_DELIVERY_DAYS).length}
      aria-invalid={invalid}
      className="h-10 w-16 rounded-lg border border-border-strong bg-surface px-3 text-sm aria-[invalid=true]:border-danger"
    />
  );
}

function Range({
  prefix,
  suffix,
  names,
  values,
  onChange,
  placeholder,
  invalid,
  t,
}: {
  t: AdminMessages["settings"]["shipping"]["rateForm"];
  prefix?: string;
  suffix?: string;
  names: [string, string];
  values: [string, string];
  onChange: [(value: string) => void, (value: string) => void];
  placeholder: string;
  invalid: boolean;
}) {
  return (
    <div className="grid max-w-md grid-cols-2 gap-3">
      {[t.minimum, t.maximum].map((label, index) => (
        <div key={label} className="space-y-1.5">
          <label htmlFor={names[index]} className="block text-sm font-medium">
            {label}
          </label>
          <Affixed prefix={prefix} suffix={suffix}>
            <input
              id={names[index]}
              name={names[index]}
              inputMode="decimal"
              value={values[index]}
              onChange={(event) => onChange[index](event.target.value)}
              placeholder={index === 0 ? placeholder : t.noLimit}
              aria-invalid={invalid}
              className="h-10 w-full min-w-0 bg-transparent px-2 text-sm outline-none"
            />
          </Affixed>
        </div>
      ))}
    </div>
  );
}

function Affixed({
  prefix,
  suffix,
  className,
  children,
}: {
  prefix?: string;
  suffix?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg border border-border-strong bg-surface focus-within:border-foreground has-aria-invalid:border-danger",
        className,
      )}
    >
      {prefix ? <span className="ps-3 text-sm text-muted select-none">{prefix}</span> : null}
      {children}
      {suffix ? <span className="pe-3 text-sm text-muted select-none">{suffix}</span> : null}
    </div>
  );
}
