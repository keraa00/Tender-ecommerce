import { countryName, isCountryCode } from "./countries";
import {
  addressFormat,
  canonicalPostalCode,
  regionOptions,
  type AddressField,
} from "./formats";
import type { PostalAddress, ShippingDestination } from "./types";

/**
 * Checking an address against its country's format and the store's checkout
 * settings, reading one back from an order, and printing one. Pure and
 * dependency-free: the checkout form, the order transaction and the admin all
 * share it, and the rules are tested without a browser.
 *
 * Errors are codes, not sentences, so the storefront can word them in the
 * buyer's language.
 */

export type FieldMode = "HIDDEN" | "OPTIONAL" | "REQUIRED";

/** Which optional fields the store asks for — its checkout settings. */
export type AddressRules = {
  firstName: FieldMode;
  company: FieldMode;
  line2: FieldMode;
  phone: FieldMode;
};

/** Also set as `maxLength` on the inputs, so the browser enforces it first. */
export const ADDRESS_MAX_LENGTH: Record<AddressField, number> = {
  firstName: 60,
  lastName: 60,
  company: 100,
  line1: 200,
  line2: 200,
  city: 120,
  region: 120,
  postalCode: 20,
  phone: 30,
};

/** An address as typed — every field a string, possibly empty. */
export type RawAddress = Record<AddressField | "countryCode", string>;

export const BLANK_ADDRESS: RawAddress = {
  countryCode: "",
  firstName: "",
  lastName: "",
  company: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  phone: "",
};

export type AddressErrorCode = "required" | "postalCode" | "region" | "phone" | "country" | "tooLong";
export type AddressErrors = Partial<Record<AddressField | "countryCode", AddressErrorCode>>;

export type AddressCheck =
  | { ok: true; address: PostalAddress }
  | { ok: false; errors: AddressErrors };

const FIELDS = Object.keys(BLANK_ADDRESS) as (keyof RawAddress)[];

/**
 * The address fields posted under a prefix — `shipping.city`, `billing.city`.
 * Runs of whitespace collapse: an address is printed on a label, not parsed,
 * and stray newlines from a paste do not belong on it.
 */
export function readAddressFields(formData: FormData, prefix: string): RawAddress {
  const raw = { ...BLANK_ADDRESS };
  for (const name of FIELDS) {
    const value = formData.get(`${prefix}.${name}`);
    raw[name] = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  }
  raw.countryCode = raw.countryCode.toUpperCase();
  return raw;
}

/** Digits, spaces and the usual punctuation, with six to fifteen digits. */
function isPhone(value: string): boolean {
  if (!/^\+?[\d\s().\-/]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 6 && digits <= 15;
}

/** Fields the rules hide are never asked for, and so never kept. */
function modeOf(field: AddressField, rules: AddressRules): FieldMode {
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
    case "postalCode":
      return "OPTIONAL"; // the country decides; see below
    default:
      return "REQUIRED";
  }
}

/**
 * Checks an address. `scope: "location"` checks only what shipping is priced
 * from — country, region, city, street, postal code — which is how checkout
 * decides whether there is enough address to quote rates for yet.
 */
export function validateAddress(
  raw: RawAddress,
  rules: AddressRules,
  { scope = "full" }: { scope?: "full" | "location" } = {},
): AddressCheck {
  const errors: AddressErrors = {};
  const countryCode = raw.countryCode.toUpperCase();

  if (countryCode === "") errors.countryCode = "required";
  else if (!isCountryCode(countryCode)) errors.countryCode = "country";

  const format = addressFormat(countryCode);
  const location: AddressField[] = ["line1", "city", "region", "postalCode"];

  for (const field of Object.keys(ADDRESS_MAX_LENGTH) as AddressField[]) {
    if (scope === "location" && !location.includes(field)) continue;
    const value = raw[field];
    const mode = modeOf(field, rules);
    if (mode === "HIDDEN") continue;
    if (value.length > ADDRESS_MAX_LENGTH[field]) errors[field] = "tooLong";
    else if (mode === "REQUIRED" && value === "") errors[field] = "required";
  }

  // --- Region: from the country's list when it has one ----------------------

  let regionCode: string | null = null;
  let region: string | null = null;
  const options = regionOptions(countryCode);

  if (format.region && !errors.region) {
    if (options) {
      const match = options.find((option) => option.code === raw.region.toUpperCase());
      if (match) {
        regionCode = match.code;
        region = match.name;
      } else if (raw.region !== "") {
        errors.region = "region";
      } else if (format.region.required) {
        errors.region = "required";
      }
    } else if (raw.region !== "") {
      region = raw.region;
    } else if (format.region.required) {
      errors.region = "required";
    }
  }

  // --- Postal code: required and shaped as the country writes it ------------

  let postalCode: string | null = null;
  if (format.postal && !errors.postalCode) {
    const canonical = canonicalPostalCode(raw.postalCode, format.postal);
    if (canonical === "") {
      if (format.postal.required) errors.postalCode = "required";
    } else if (format.postal.pattern && !new RegExp(format.postal.pattern).test(canonical)) {
      errors.postalCode = "postalCode";
    } else {
      postalCode = canonical;
    }
  }

  if (scope === "full" && rules.phone !== "HIDDEN" && raw.phone !== "" && !errors.phone && !isPhone(raw.phone)) {
    errors.phone = "phone";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const optional = (field: AddressField) =>
    modeOf(field, rules) === "HIDDEN" || raw[field] === "" ? null : raw[field];

  return {
    ok: true,
    address: {
      firstName: optional("firstName"),
      lastName: raw.lastName,
      company: optional("company"),
      line1: raw.line1,
      line2: optional("line2"),
      city: raw.city,
      regionCode,
      region,
      postalCode,
      countryCode,
      phone: optional("phone"),
    },
  };
}

/** What shipping is priced from, or null while the location is incomplete. */
export function destinationOf(raw: RawAddress, rules: AddressRules): ShippingDestination | null {
  const check = validateAddress(raw, rules, { scope: "location" });
  return check.ok
    ? { countryCode: check.address.countryCode, regionCode: check.address.regionCode }
    : null;
}

// ---------------------------------------------------------------------------
// Reading and printing stored addresses
// ---------------------------------------------------------------------------

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

/**
 * An address as an order stored it, read defensively: it is JSON, not a
 * table. Reads both shapes — the structured one, and the one orders had
 * before it, `{ name, line1, …, country }` with the country as typed. The
 * legacy name lands in `lastName`, and a typed country in `countryCode`,
 * which `countryLabel` prints as is.
 */
export function readAddress(value: unknown): PostalAddress | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;

  const legacy = "name" in entry || "country" in entry;
  const lastName = text(legacy ? entry.name : entry.lastName) ?? "";
  const countryCode = text(legacy ? entry.country : entry.countryCode) ?? "";
  if (lastName === "" && text(entry.line1) === null) return null;

  return {
    firstName: legacy ? null : text(entry.firstName),
    lastName,
    company: text(entry.company),
    line1: text(entry.line1) ?? "",
    line2: text(entry.line2),
    city: text(entry.city) ?? "",
    regionCode: text(entry.regionCode),
    region: text(entry.region),
    postalCode: text(entry.postalCode),
    countryCode,
    phone: text(entry.phone),
  };
}

export function fullName(address: Pick<PostalAddress, "firstName" | "lastName" | "countryCode">): string {
  const parts =
    addressFormat(address.countryCode).rows[0]?.[0] === "lastName"
      ? [address.lastName, address.firstName]
      : [address.firstName, address.lastName];
  return parts.filter(Boolean).join(" ");
}

/** The country's name in the reader's language, or a legacy order's text. */
export function countryLabel(countryCode: string, locale: string): string {
  return isCountryCode(countryCode) ? countryName(countryCode, locale) : countryCode;
}

const ABBREVIATED: ReadonlySet<string> = new Set(["US", "CA", "AU"]);

/**
 * An address as lines on a label, in the country's own order: "1016 GV
 * Amsterdam", but "Austin, TX 78701". The phone is left off — it is contact,
 * not address — for the caller to show beside it.
 */
export function formatAddressLines(address: PostalAddress, locale: string): string[] {
  const format = addressFormat(address.countryCode);
  // North American and Australian addresses abbreviate the state; elsewhere
  // the name is what is written.
  const region = ABBREVIATED.has(address.countryCode)
    ? (address.regionCode ?? address.region)
    : (address.region ?? address.regionCode);
  const together = format.rows.find((row) => row.includes("city") && row.includes("postalCode"));

  const locality = !together
    ? // The postal code on a line of its own: the UK, Japan.
      [[address.city, region].filter(Boolean).join(", "), address.postalCode]
    : together.indexOf("postalCode") < together.indexOf("city")
      ? [[address.postalCode, address.city].filter(Boolean).join(" "), region]
      : [
          [address.city, [region, address.postalCode].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(", "),
        ];

  return [
    fullName(address),
    address.company,
    address.line1,
    address.line2,
    ...locality,
    countryLabel(address.countryCode, locale),
  ].filter((line): line is string => Boolean(line && line.trim()));
}
