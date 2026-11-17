"use client";

import { useActionState, useId, useMemo, useState } from "react";

import { SaveBar, useDiscard, useResyncAfterReset } from "@/components/admin/save-bar";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { regionsOf } from "@/lib/address/regions";
import { useAdminI18n } from "@/components/admin/admin-i18n";
import { cn } from "@/lib/cn";
import { format, plural } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { ZoneFormState } from "@/lib/shipping/actions";
import { MAX_ZONE_NAME } from "@/lib/shipping/form";

export type CountryOption = { code: string; name: string };

type Selection = { countryCode: string; regionCodes: string[] };

type ZoneFormProps = {
  action: (state: ZoneFormState, formData: FormData) => Promise<ZoneFormState>;
  /** Every country, named in the admin's language on the server — see `countryOptions`. */
  countries: CountryOption[];
  /** Countries in the store's other zones, with the zone they are in. */
  taken: Record<string, string>;
  zone?: { name: string; countries: Selection[] };
  restOfWorld: boolean;
  submitLabel: string;
  initialNotice?: string;
  t: ZoneFormCopy;
};

type ZoneFormCopy = AdminMessages["settings"]["shipping"]["zoneForm"];

export function ZoneForm(props: ZoneFormProps) {
  const { key, discard } = useDiscard();
  return (
    <ZoneFormBody
      key={key}
      {...props}
      initialNotice={key === 0 ? props.initialNotice : undefined}
      onDiscard={discard}
    />
  );
}

function ZoneFormBody({
  action,
  countries,
  taken,
  zone,
  restOfWorld,
  submitLabel,
  initialNotice,
  t,
  onDiscard,
}: ZoneFormProps & { onDiscard: () => void }) {
  const [state, formAction, pending] = useActionState<ZoneFormState, FormData>(
    action,
    initialNotice ? { notice: initialNotice } : {},
  );
  const errors = state.fieldErrors ?? {};
  const resync = useResyncAfterReset();
  // Controlled, so an error reply does not lose what was typed — React resets
  // uncontrolled fields once a form action settles.
  const [name, setName] = useState(zone?.name ?? (restOfWorld ? t.defaultRestOfWorldName : ""));

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
          htmlFor="zone-name"
          error={errors.name}
          hint={t.nameHint}
        >
          <Input
            id="zone-name"
            name="name"
            maxLength={MAX_ZONE_NAME}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.namePlaceholder}
            aria-invalid={Boolean(errors.name)}
            className="sm:max-w-sm"
          />
        </Field>
      </section>

      {restOfWorld ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-medium tracking-tight">{t.countries}</h2>
          <p className="mt-1 text-sm text-muted text-pretty">{t.restOfWorldCountries}</p>
        </section>
      ) : (
        <CountryPicker
          countries={countries}
          taken={taken}
          initial={zone?.countries ?? []}
          error={errors.countries}
          t={t}
        />
      )}
    </form>
  );
}

/**
 * Countries, searchable, with any that have a region list offering "all of it"
 * or "only some regions". What is chosen goes to the server as hidden fields —
 * `country`, `scope:<code>` and `regions:<code>` — which `parseZoneForm` reads.
 */
function CountryPicker({
  countries,
  taken,
  initial,
  error,
  t,
}: {
  countries: CountryOption[];
  taken: Record<string, string>;
  initial: Selection[];
  error?: string;
  t: ZoneFormCopy;
}) {
  const { locale, intl } = useAdminI18n();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Selection[]>(initial);
  // Countries the seller has switched to "only some regions". A country saved
  // with regions starts in it; ticking every region keeps it there until saved.
  const [narrowed, setNarrowed] = useState<Set<string>>(
    () => new Set(initial.filter((entry) => entry.regionCodes.length > 0).map((entry) => entry.countryCode)),
  );

  const names = useMemo(
    () => new Map(countries.map((country) => [country.code, country.name])),
    [countries],
  );
  const chosen = new Set(selected.map((entry) => entry.countryCode));
  const needle = query.trim().toLowerCase();
  const matches = countries.filter(
    (country) =>
      !chosen.has(country.code) &&
      (needle === "" ||
        country.name.toLowerCase().includes(needle) ||
        country.code.toLowerCase() === needle),
  );

  const add = (code: string) => setSelected((current) => [...current, { countryCode: code, regionCodes: [] }]);
  const remove = (code: string) => {
    setSelected((current) => current.filter((entry) => entry.countryCode !== code));
    setNarrowed((current) => {
      const next = new Set(current);
      next.delete(code);
      return next;
    });
  };
  const setRegions = (code: string, regionCodes: string[]) =>
    setSelected((current) =>
      current.map((entry) => (entry.countryCode === code ? { ...entry, regionCodes } : entry)),
    );
  const setScope = (code: string, some: boolean) => {
    setNarrowed((current) => {
      const next = new Set(current);
      if (some) next.add(code);
      else next.delete(code);
      return next;
    });
    // Start "some" from every region ticked: excluding a few — Alaska and
    // Hawaii — is the usual reason to narrow.
    setRegions(code, some ? (regionsOf(code) ?? []).map((region) => region.code) : []);
  };

  const sorted = [...selected].sort((a, b) =>
    (names.get(a.countryCode) ?? a.countryCode).localeCompare(
      names.get(b.countryCode) ?? b.countryCode,
      intl,
    ),
  );

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 className="text-sm font-medium tracking-tight">{t.countries}</h2>
        <p className="mt-0.5 text-sm text-muted text-pretty">
          {selected.length === 0
            ? t.chooseCountries
            : plural(locale, selected.length, t.countriesInZone)}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {sorted.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {sorted.map((entry) => {
            const regions = regionsOf(entry.countryCode);
            const some = narrowed.has(entry.countryCode);
            const name = names.get(entry.countryCode) ?? entry.countryCode;
            return (
              <li key={entry.countryCode} className="space-y-3 px-3 py-2.5">
                <input type="hidden" name="country" value={entry.countryCode} />
                {some ? (
                  <>
                    <input type="hidden" name={`scope:${entry.countryCode}`} value="some" />
                    {entry.regionCodes.map((code) => (
                      <input key={code} type="hidden" name={`regions:${entry.countryCode}`} value={code} />
                    ))}
                  </>
                ) : null}

                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 text-sm">
                    <span className="font-medium">{name}</span>
                    {regions ? (
                      <span className="text-muted">
                        {" · "}
                        {some
                          ? format(t.regionsOf, {
                              count: entry.regionCodes.length,
                              total: regions.length,
                            })
                          : t.allRegions}
                      </span>
                    ) : null}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(entry.countryCode)}
                    aria-label={format(t.removeCountry, { name })}
                  >
                    {t.remove}
                  </Button>
                </div>

                {regions ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          checked={!some}
                          onChange={() => setScope(entry.countryCode, false)}
                        />
                        {format(t.allOf, { name })}
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          checked={some}
                          onChange={() => setScope(entry.countryCode, true)}
                        />
                        {t.someRegions}
                      </label>
                    </div>

                    {some ? (
                      <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-subtle p-2">
                        <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
                          {regions.map((region) => (
                            <label
                              key={region.code}
                              className="flex min-w-0 cursor-pointer items-center gap-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={entry.regionCodes.includes(region.code)}
                                onChange={(event) =>
                                  setRegions(
                                    entry.countryCode,
                                    event.target.checked
                                      ? [...entry.regionCodes, region.code]
                                      : entry.regionCodes.filter((code) => code !== region.code),
                                  )
                                }
                              />
                              <span className="truncate">{region.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="space-y-2">
        <label htmlFor={searchId} className="block text-sm font-medium">
          {t.addCountries}
        </label>
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchCountries}
          autoComplete="off"
        />
        <ul className="max-h-64 overflow-y-auto rounded-lg border border-border">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{t.noMatch}</li>
          ) : (
            matches.map((country) => {
              const owner = taken[country.code];
              return (
                <li key={country.code}>
                  <button
                    type="button"
                    disabled={Boolean(owner)}
                    onClick={() => add(country.code)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition-colors",
                      owner ? "cursor-default text-muted" : "cursor-pointer hover:bg-surface-hover",
                    )}
                  >
                    <span className="min-w-0 truncate">{country.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {owner ? format(t.inZone, { zone: owner }) : t.add}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </section>
  );
}
