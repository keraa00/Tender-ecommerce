"use client";

import type { ReactNode } from "react";

import { addressFormat, regionOptions, type AddressField } from "@/lib/address/formats";
import {
  ADDRESS_MAX_LENGTH,
  type AddressErrorCode,
  type AddressRules,
  type FieldMode,
  type RawAddress,
} from "@/lib/address/validate";
import { cn } from "@/lib/cn";
import type { AddressPrefix } from "@/lib/checkout/fields";
import { format } from "@/lib/i18n/messages";
import type { CheckoutMessages, CountryOptionDisplay } from "./types";

/**
 * One address — shipping or billing — laid out the way its country writes it:
 * the fields it has, in its order, under its names. A US address asks for a
 * state from a list and a ZIP code; a Japanese one starts with the postal code
 * and a prefecture; a Dutch one has no region at all. The country select comes
 * first, because everything below it depends on it.
 *
 * Controlled: the checkout owns the values, so a re-render after saving never
 * loses what the buyer is in the middle of typing.
 */
export function AddressFields({
  prefix,
  value,
  onChange,
  onCommit,
  countries,
  rules,
  errors,
  t,
}: {
  prefix: AddressPrefix;
  value: RawAddress;
  onChange: (field: keyof RawAddress, value: string) => void;
  /** A choice made — country, region — or a field left: worth saving now. */
  onCommit: () => void;
  countries: CountryOptionDisplay[];
  rules: AddressRules;
  errors: Partial<Record<keyof RawAddress, AddressErrorCode>>;
  t: CheckoutMessages;
}) {
  const country = value.countryCode;
  const addressFormatFor = addressFormat(country);
  const regions = regionOptions(country);
  const id = (field: string) => `${prefix}-${field}`;

  const mode = (field: AddressField): FieldMode | "NONE" => {
    switch (field) {
      case "firstName":
        return rules.firstName;
      case "company":
        return rules.company;
      case "line2":
        return rules.line2;
      case "phone":
        return rules.phone;
      case "region":
        return addressFormatFor.region
          ? addressFormatFor.region.required
            ? "REQUIRED"
            : "OPTIONAL"
          : "NONE";
      case "postalCode":
        return addressFormatFor.postal
          ? addressFormatFor.postal.required
            ? "REQUIRED"
            : "OPTIONAL"
          : "NONE";
      default:
        return "REQUIRED";
    }
  };

  const baseLabel = (field: AddressField): string => {
    switch (field) {
      case "firstName":
        return t.firstName;
      case "lastName":
        return t.lastName;
      case "company":
        return t.company;
      case "line1":
        return t.address1;
      case "line2":
        return t.address2;
      case "city":
        return addressFormatFor.city === "suburb" ? t.suburb : t.city;
      case "region":
        return t.regions[addressFormatFor.region?.label ?? "region"];
      case "postalCode":
        return t.postal[addressFormatFor.postal?.label ?? "postalCode"];
      case "phone":
        return t.phone;
    }
  };

  const message = (field: keyof RawAddress): string | undefined => {
    const code = errors[field];
    if (!code) return undefined;
    switch (code) {
      case "postalCode":
        return format(t.errors.postalCode, { example: addressFormatFor.postal?.example ?? "" });
      case "region":
        return t.errors.region;
      case "phone":
        return t.errors.phone;
      case "country":
        return t.errors.country;
      case "tooLong":
        return t.errors.tooLong;
      default:
        return t.errors.required;
    }
  };

  // Each field's autocomplete token, sectioned so a browser fills the
  // shipping and billing addresses from the right saved entries.
  const autocomplete: Record<AddressField, string> = {
    firstName: "given-name",
    lastName: "family-name",
    company: "organization",
    line1: "address-line1",
    line2: "address-line2",
    city: "address-level2",
    region: "address-level1",
    postalCode: "postal-code",
    phone: "tel",
  };

  const rows = addressFormatFor.rows
    .map((row) => row.filter((field) => mode(field) !== "HIDDEN" && mode(field) !== "NONE"))
    .filter((row) => row.length > 0);

  return (
    <div className="space-y-3">
      <Labelled id={id("countryCode")} label={t.country} error={message("countryCode")}>
        <select
          id={id("countryCode")}
          name={`${prefix}.countryCode`}
          value={country}
          autoComplete={`section-${prefix} ${prefix} country`}
          aria-invalid={Boolean(errors.countryCode)}
          onChange={(event) => {
            onChange("countryCode", event.target.value);
            // A state picked for the old country means nothing in the new one.
            onChange("region", "");
            onCommit();
          }}
          className={fieldClasses}
        >
          {country === "" ? <option value="">{t.choose}</option> : null}
          {countries.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
      </Labelled>

      {rows.map((row) => (
        <div
          key={row.join("-")}
          className={cn("grid gap-3", row.length === 2 && "sm:grid-cols-2", row.length === 3 && "sm:grid-cols-3")}
        >
          {row.map((field) => {
            const fieldMode = mode(field);
            const label =
              fieldMode === "OPTIONAL" ? format(t.optional, { label: baseLabel(field) }) : baseLabel(field);
            const error = message(field);
            const common = {
              id: id(field),
              name: `${prefix}.${field}`,
              value: value[field],
              "aria-invalid": Boolean(error),
              "aria-describedby": error ? `${id(field)}-error` : undefined,
              // "section-billing billing address-line1"; a phone has no address
              // type, only its section.
              autoComplete: `section-${prefix} ${field === "phone" ? "" : `${prefix} `}${autocomplete[field]}`,
              className: fieldClasses,
            };

            return (
              <Labelled key={field} id={id(field)} label={label} error={error}>
                {field === "region" && regions ? (
                  <select
                    {...common}
                    onChange={(event) => {
                      onChange("region", event.target.value);
                      onCommit();
                    }}
                  >
                    <option value="">{t.choose}</option>
                    {regions.map((region) => (
                      <option key={region.code} value={region.code}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    {...common}
                    type={field === "phone" ? "tel" : "text"}
                    inputMode={field === "phone" ? "tel" : undefined}
                    maxLength={ADDRESS_MAX_LENGTH[field]}
                    placeholder={field === "postalCode" ? (addressFormatFor.postal?.example ?? undefined) : undefined}
                    onChange={(event) => onChange(field, event.target.value)}
                    onBlur={onCommit}
                  />
                )}
              </Labelled>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const fieldClasses =
  "h-11 w-full min-w-0 rounded-lg border border-border-strong bg-surface px-3 text-sm aria-[invalid=true]:border-danger";

function Labelled({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
