"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";

import { useAdminI18n } from "@/components/admin/admin-i18n";
import { SaveBar, useDiscard, useResyncAfterReset } from "@/components/admin/save-bar";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { CodSettingsState } from "@/lib/stores/actions";
import {
  COD_INSTRUCTIONS_MAX,
  COD_LABEL_MAX,
  type CodFormValues,
} from "@/lib/stores/settings-form";

type CountryOption = { code: string; name: string };

type Props = {
  action: (state: CodSettingsState, formData: FormData) => Promise<CodSettingsState>;
  values: CodFormValues;
  /** "$", "KM" — beside every amount. */
  currencySymbol: string;
  /** The countries the store ships to, named in the admin's language, for the country limit. */
  countries: CountryOption[];
  /** Whether the store can take cards too; the copy differs when cash is all there is. */
  stripeLive: boolean;
  t: AdminMessages["settings"]["cod"];
  saveLabel: string;
};

/**
 * Settings → Payments → Cash on delivery: whether it is offered, what it is
 * called, what it costs, and which orders may use it. Controlled, like the
 * checkout settings, so React's reset of uncontrolled fields after the action
 * settles never flips a choice back while the page catches up.
 */
export function CodSettingsForm(props: Props) {
  const { key, discard } = useDiscard();
  return <CodSettingsFormBody key={key} {...props} onDiscard={discard} />;
}

function CodSettingsFormBody({
  action,
  values: saved,
  currencySymbol,
  countries,
  stripeLive,
  t,
  saveLabel,
  onDiscard,
}: Props & { onDiscard: () => void }) {
  const [state, formAction, pending] = useActionState<CodSettingsState, FormData>(action, {});
  const errors = state.fieldErrors ?? {};
  const resync = useResyncAfterReset();
  const [values, setValues] = useState(saved);
  const set = <K extends keyof CodFormValues>(name: K, value: CodFormValues[K]) =>
    setValues((current) => ({ ...current, [name]: value }));

  return (
    <form action={formAction} className="space-y-6" noValidate {...resync}>
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

      <Toggle
        name="codEnabled"
        checked={values.codEnabled}
        onChange={(checked) => set("codEnabled", checked)}
        label={t.offer}
        hint={stripeLive ? t.offerHintWithStripe : t.offerHintCashOnly}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t.name}
          htmlFor="codLabel"
          error={errors.codLabel}
          hint={t.nameHint}
        >
          <Input
            id="codLabel"
            name="codLabel"
            maxLength={COD_LABEL_MAX}
            value={values.codLabel}
            onChange={(event) => set("codLabel", event.target.value)}
            placeholder={t.namePlaceholder}
            aria-invalid={Boolean(errors.codLabel)}
          />
        </Field>

        <div className="space-y-1.5">
          <p id="codFeeType-label" className="text-sm font-medium">
            {t.fee}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-labelledby="codFeeType-label" className="flex gap-1.5">
              {(
                [
                  ["FIXED_AMOUNT", t.fixed],
                  ["PERCENTAGE", t.percentage],
                ] as const
              ).map(([type, label]) => (
                <label
                  key={type}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm has-checked:border-foreground has-checked:bg-surface-hover"
                >
                  <input
                    type="radio"
                    name="codFeeType"
                    value={type}
                    checked={values.codFeeType === type}
                    onChange={() => set("codFeeType", type)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <Affixed
              prefix={values.codFeeType === "FIXED_AMOUNT" ? currencySymbol : undefined}
              suffix={values.codFeeType === "PERCENTAGE" ? "%" : undefined}
              className="w-32"
            >
              <input
                id="codFee"
                name="codFee"
                inputMode="decimal"
                aria-label={t.fee}
                value={values.codFee}
                onChange={(event) => set("codFee", event.target.value)}
                placeholder="0"
                aria-invalid={Boolean(errors.codFee)}
                className="h-10 w-full min-w-0 bg-transparent px-2 text-sm outline-none"
              />
            </Affixed>
          </div>
          {errors.codFee ? (
            <p role="alert" className="text-sm text-danger">
              {errors.codFee}
            </p>
          ) : (
            <p className="text-sm text-muted text-pretty">
              {values.codFeeType === "PERCENTAGE" ? t.feeHintPercent : t.feeHintFixed} {t.noFee}
            </p>
          )}
        </div>
      </div>

      <Field
        label={t.instructions}
        htmlFor="codInstructions"
        error={errors.codInstructions}
        hint={t.instructionsHint}
      >
        <Textarea
          id="codInstructions"
          name="codInstructions"
          rows={2}
          maxLength={COD_INSTRUCTIONS_MAX}
          value={values.codInstructions}
          onChange={(event) => set("codInstructions", event.target.value)}
          placeholder={t.instructionsPlaceholder}
          aria-invalid={Boolean(errors.codInstructions)}
        />
      </Field>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t.orderTotal}</p>
        <div className="grid max-w-md grid-cols-2 gap-3">
          {(
            [
              ["codMinTotal", t.minimum, t.noMinimum],
              ["codMaxTotal", t.maximum, t.noLimit],
            ] as const
          ).map(([name, label, placeholder]) => (
            <div key={name} className="space-y-1.5">
              <label htmlFor={name} className="block text-xs text-muted">
                {label}
              </label>
              <Affixed prefix={currencySymbol}>
                <input
                  id={name}
                  name={name}
                  inputMode="decimal"
                  value={values[name]}
                  onChange={(event) => set(name, event.target.value)}
                  placeholder={placeholder}
                  aria-invalid={Boolean(errors[name])}
                  className="h-10 w-full min-w-0 bg-transparent px-2 text-sm outline-none"
                />
              </Affixed>
            </div>
          ))}
        </div>
        {errors.codMinTotal || errors.codMaxTotal ? (
          <p role="alert" className="text-sm text-danger">
            {errors.codMinTotal ?? errors.codMaxTotal}
          </p>
        ) : (
          <p className="text-sm text-muted text-pretty">{t.rangeHint}</p>
        )}
      </div>

      <CountryLimit
        scope={values.codCountryScope}
        selected={values.codCountryCodes}
        countries={countries}
        error={errors.codCountries}
        onScope={(scope) => set("codCountryScope", scope)}
        onSelected={(codes) => set("codCountryCodes", codes)}
        t={t}
      />

      <Toggle
        name="codRequirePhone"
        checked={values.codRequirePhone}
        onChange={(checked) => set("codRequirePhone", checked)}
        label={t.requirePhone}
        hint={t.requirePhoneHint}
      />
    </form>
  );
}

/**
 * Everywhere the store ships, or only some of it. The chosen countries are
 * posted from hidden inputs rather than the checkboxes, so a search that hides
 * some of them does not drop them from the form.
 */
function CountryLimit({
  scope,
  selected,
  countries,
  error,
  onScope,
  onSelected,
  t,
}: {
  t: AdminMessages["settings"]["cod"];
  scope: "all" | "some";
  selected: string[];
  countries: CountryOption[];
  error?: string;
  onScope: (scope: "all" | "some") => void;
  onSelected: (codes: string[]) => void;
}) {
  const { locale, intl } = useAdminI18n();
  const [query, setQuery] = useState("");
  const chosen = new Set(selected);
  const needle = query.trim().toLowerCase();
  const names = useMemo(() => new Map(countries.map((country) => [country.code, country.name])), [countries]);
  const shown = needle
    ? countries.filter(
        (country) => country.name.toLowerCase().includes(needle) || country.code.toLowerCase() === needle,
      )
    : countries;

  const toggle = (code: string) =>
    onSelected(chosen.has(code) ? selected.filter((entry) => entry !== code) : [...selected, code]);

  return (
    <div className="space-y-2">
      <p id="codCountryScope-label" className="text-sm font-medium">
        {t.countries}
      </p>
      <div role="radiogroup" aria-labelledby="codCountryScope-label" className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", t.everywhere],
            ["some", t.some],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm has-checked:border-foreground has-checked:bg-surface-hover"
          >
            <input
              type="radio"
              name="codCountryScope"
              value={value}
              checked={scope === value}
              onChange={() => onScope(value)}
            />
            {label}
          </label>
        ))}
      </div>

      {scope === "some" ? (
        <div className="space-y-2 rounded-lg border border-border bg-surface-subtle p-3">
          {selected.map((code) => (
            <input key={code} type="hidden" name="codCountry" value={code} />
          ))}
          <p className="text-sm text-muted">
            {selected.length === 0
              ? t.chooseCountries
              : plural(locale, selected.length, t.chosenCountries, {
                  names: selected
                    .map((code) => names.get(code) ?? code)
                    .sort((a, b) => a.localeCompare(b, intl))
                    .join(", "),
                })}
          </p>
          {countries.length > 8 ? (
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchCountries}
              aria-label={t.searchCountries}
            />
          ) : null}
          {countries.length === 0 ? (
            <p className="text-sm text-muted">{t.noZones}</p>
          ) : (
            <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
              {shown.map((country) => (
                <li key={country.code}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-hover">
                    <input
                      type="checkbox"
                      checked={chosen.has(country.code)}
                      onChange={() => toggle(country.code)}
                    />
                    {country.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
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
