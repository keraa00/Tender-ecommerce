/**
 * Every ISO 3166-1 alpha-2 country code. Names are not kept here: they come
 * from `Intl.DisplayNames` in the reader's language, which knows them all and
 * keeps up with renames ("Czechia", "Türkiye") without a data release.
 *
 * Dependency-free, so client components can import it.
 */

export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

const KNOWN: ReadonlySet<string> = new Set(COUNTRY_CODES);

/**
 * Territories nobody lives in permanently. They are real codes — a seller may
 * still name one in a zone — but "rest of world" does not offer them to buyers.
 */
const UNINHABITED: ReadonlySet<string> = new Set(["AQ", "BV", "GS", "HM", "UM"]);

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && KNOWN.has(value);
}

/** Every country a rest-of-world zone can deliver to. */
export const DELIVERABLE_COUNTRY_CODES: readonly CountryCode[] = COUNTRY_CODES.filter(
  (code) => !UNINHABITED.has(code),
);

/**
 * Country names in one language, sorted as that language sorts them. A BCP 47
 * tag in, so the storefront names countries in the buyer's language and the
 * admin in English. Call it on the server and hand the strings to the client:
 * Node and the browser ship different ICU data, and a name formatted on both
 * sides can disagree and fail hydration.
 */
export function countryOptions(
  codes: readonly string[],
  locale: string,
): { code: string; name: string }[] {
  const names = new Intl.DisplayNames([locale], { type: "region", fallback: "code" });
  const collator = new Intl.Collator(locale);
  return codes
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/** One country's name in one language. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region", fallback: "code" }).of(code) ?? code;
  } catch {
    // Not a well-formed region code — a legacy order's free-text country.
    return code;
  }
}
