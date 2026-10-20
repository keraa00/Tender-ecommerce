import { regionsOf, type Region } from "./regions";

/**
 * How each country writes an address: which fields, in what order, what the
 * region and postal code are called, whether they are required, and what a
 * valid postal code looks like. The checkout form lays itself out from this;
 * `validate.ts` checks against it; the admin prints addresses with it.
 *
 * Plain data, dependency-free, so the checkout form can import it. Countries
 * not listed get `DEFAULT_FORMAT`: every field, an optional free-text region
 * and an optional postal code with no pattern — enough to post anything,
 * strict about nothing.
 */

export type AddressField =
  | "firstName"
  | "lastName"
  | "company"
  | "line1"
  | "line2"
  | "city"
  | "region"
  | "postalCode"
  | "phone";

/** Message keys, worded per language in the storefront's message files. */
export type RegionLabel = "state" | "province" | "county" | "prefecture" | "stateTerritory" | "region";
export type PostalLabel = "postalCode" | "zipCode" | "postcode" | "pinCode" | "eircode";
export type CityLabel = "city" | "suburb";

export type PostalRule = {
  label: PostalLabel;
  required: boolean;
  /** Matched against the canonical form below; null accepts anything. */
  pattern: string | null;
  /** Shown in the error, so the buyer sees what is expected. */
  example: string | null;
  /**
   * Where the canonical form puts its separator, counted from the start — or
   * from the end when negative ("EC1M 5RN" is −3). The buyer may type it with
   * or without; it is taken out and put back in its place.
   */
  separator?: { at: number; char: " " | "-" };
};

export type AddressFormat = {
  /** Fields as laid out on a wide screen; the fields in a row sit side by side. */
  rows: readonly (readonly AddressField[])[];
  city: CityLabel;
  /** Null when the country's addresses carry no region. */
  region: { label: RegionLabel; required: boolean } | null;
  /** Null when the country has no postal codes. */
  postal: PostalRule | null;
};

const NAMES = ["firstName", "lastName"] as const;
const FAMILY_FIRST = ["lastName", "firstName"] as const;

/** City, then region and postal code on one line — the North American shape. */
const cityFirst = (...tail: AddressField[]) =>
  [NAMES, ["company"], ["line1"], ["line2"], ["city", ...tail], ["phone"]] as const;

/** Postal code before the city — most of continental Europe. */
const postalFirst = (...tail: AddressField[]) =>
  [NAMES, ["company"], ["line1"], ["line2"], ["postalCode", "city", ...tail], ["phone"]] as const;

const digits = (count: number, example: string): PostalRule => ({
  label: "postalCode",
  required: true,
  pattern: `^\\d{${count}}$`,
  example,
});

/** Digits with a fixed separator: Portugal's 1200-385, Sweden's 116 23. */
const split = (before: number, after: number, char: " " | "-", example: string): PostalRule => ({
  label: "postalCode",
  required: true,
  pattern: `^\\d{${before}}${char === " " ? " " : "-"}\\d{${after}}$`,
  example,
  separator: { at: before, char },
});

const EUROPE_DIGITS: Record<string, PostalRule> = {
  AT: digits(4, "1070"),
  BE: digits(4, "1000"),
  CH: digits(4, "8001"),
  DK: digits(4, "2200"),
  LU: digits(4, "1009"),
  NO: digits(4, "0555"),
  SI: digits(4, "1000"),
  DE: digits(5, "10999"),
  FI: digits(5, "00120"),
  FR: digits(5, "75009"),
  HR: digits(5, "10000"),
  CZ: split(3, 2, " ", "120 00"),
  GR: split(3, 2, " ", "105 57"),
  SE: split(3, 2, " ", "116 23"),
  SK: split(3, 2, " ", "811 01"),
  PL: split(2, 3, "-", "00-950"),
  PT: split(4, 3, "-", "1200-385"),
};

export const DEFAULT_FORMAT: AddressFormat = {
  rows: cityFirst("region", "postalCode"),
  city: "city",
  region: { label: "region", required: false },
  postal: { label: "postalCode", required: false, pattern: null, example: null },
};

const FORMATS: Record<string, AddressFormat> = {
  US: {
    rows: cityFirst("region", "postalCode"),
    city: "city",
    region: { label: "state", required: true },
    postal: { label: "zipCode", required: true, pattern: "^\\d{5}(-\\d{4})?$", example: "10001" },
  },
  CA: {
    rows: cityFirst("region", "postalCode"),
    city: "city",
    region: { label: "province", required: true },
    postal: {
      label: "postalCode",
      required: true,
      pattern: "^[ABCEGHJ-NPRSTVXY]\\d[ABCEGHJ-NPRSTV-Z] \\d[ABCEGHJ-NPRSTV-Z]\\d$",
      example: "K1A 0B1",
      separator: { at: 3, char: " " },
    },
  },
  AU: {
    rows: cityFirst("region", "postalCode"),
    city: "suburb",
    region: { label: "stateTerritory", required: true },
    postal: { label: "postcode", required: true, pattern: "^\\d{4}$", example: "2000" },
  },
  NZ: {
    rows: cityFirst("postalCode"),
    city: "city",
    region: null,
    postal: { label: "postcode", required: true, pattern: "^\\d{4}$", example: "6011" },
  },
  MX: {
    rows: [NAMES, ["company"], ["line1"], ["line2"], ["postalCode", "city"], ["region"], ["phone"]],
    city: "city",
    region: { label: "state", required: true },
    postal: digits(5, "06700"),
  },
  BR: {
    rows: [NAMES, ["company"], ["line1"], ["line2"], ["postalCode", "city"], ["region"], ["phone"]],
    city: "city",
    region: { label: "state", required: true },
    postal: { ...split(5, 3, "-", "01310-100") },
  },
  IN: {
    rows: cityFirst("region", "postalCode"),
    city: "city",
    region: { label: "state", required: true },
    postal: { label: "pinCode", required: true, pattern: "^[1-9]\\d{5}$", example: "110001" },
  },
  JP: {
    // Family name first, and the address from the largest unit down.
    rows: [FAMILY_FIRST, ["company"], ["postalCode"], ["region", "city"], ["line1"], ["line2"], ["phone"]],
    city: "city",
    region: { label: "prefecture", required: true },
    postal: { ...split(3, 4, "-", "100-0001") },
  },
  IT: {
    rows: postalFirst("region"),
    city: "city",
    region: { label: "province", required: true },
    postal: digits(5, "00184"),
  },
  ES: {
    rows: postalFirst("region"),
    city: "city",
    region: { label: "province", required: true },
    postal: digits(5, "28004"),
  },
  IE: {
    rows: cityFirst("region", "postalCode"),
    city: "city",
    region: { label: "county", required: true },
    postal: {
      label: "eircode",
      // Plenty of Irish addresses are still written without one.
      required: false,
      pattern: "^[AC-FHKNPRTV-Y](\\d{2}|6W) [0-9AC-FHKNPRTV-Y]{4}$",
      example: "D02 XY72",
      separator: { at: 3, char: " " },
    },
  },
  GB: {
    rows: [NAMES, ["company"], ["line1"], ["line2"], ["city"], ["postalCode"], ["phone"]],
    city: "city",
    region: null,
    postal: {
      label: "postcode",
      required: true,
      pattern:
        "^(GIR 0AA|[A-PR-UWYZ]([0-9]{1,2}|[A-HK-Y][0-9]([0-9ABEHMNPRV-Y])?|[0-9][A-HJKPS-UW]) [0-9][ABD-HJLNP-UW-Z]{2})$",
      example: "EC1M 5RN",
      separator: { at: -3, char: " " },
    },
  },
  NL: {
    rows: postalFirst(),
    city: "city",
    region: null,
    postal: {
      label: "postalCode",
      required: true,
      pattern: "^[1-9]\\d{3} [A-Z]{2}$",
      example: "1016 GV",
      separator: { at: 4, char: " " },
    },
  },
  IS: { rows: postalFirst(), city: "city", region: null, postal: digits(3, "101") },
  HK: { rows: cityFirst(), city: "city", region: null, postal: null },
  AE: { rows: cityFirst(), city: "city", region: null, postal: null },
  ...Object.fromEntries(
    Object.entries(EUROPE_DIGITS).map(([code, postal]) => [
      code,
      { rows: postalFirst(), city: "city", region: null, postal } satisfies AddressFormat,
    ]),
  ),
};

export function addressFormat(countryCode: string): AddressFormat {
  return FORMATS[countryCode] ?? DEFAULT_FORMAT;
}

/** The fixed region list the region field picks from, or null for free text. */
export function regionOptions(countryCode: string): readonly Region[] | null {
  return addressFormat(countryCode).region ? regionsOf(countryCode) : null;
}

/** Countries with a format of their own, for tests and documentation. */
export const FORMATTED_COUNTRIES: readonly string[] = Object.keys(FORMATS);

/**
 * A postal code as the country writes it: upper-case, single-spaced, and with
 * its separator in its place when the country has one — "ec1m5rn" becomes
 * "EC1M 5RN", "1016gv" becomes "1016 GV".
 */
export function canonicalPostalCode(raw: string, rule: PostalRule | null): string {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (!rule?.separator) return upper;

  const bare = upper.replace(/[\s-]/g, "");
  const { at, char } = rule.separator;
  const index = at < 0 ? bare.length + at : at;
  if (index <= 0 || index >= bare.length) return upper;
  return `${bare.slice(0, index)}${char}${bare.slice(index)}`;
}
