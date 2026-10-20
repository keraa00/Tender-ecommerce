/**
 * The currencies a store can sell in. One per store, never converted.
 *
 * Money is integer cents everywhere, so only currencies with exactly two minor
 * digits are offered: "cents" of the yen or won do not exist, and the Kuwaiti
 * dinar has three. A test holds each entry to that against `Intl`. HUF, TWD and
 * ISK are left out as well — two decimals in ISO 4217, but settled as whole
 * units by card processors, which would make a price unpayable as shown.
 *
 * Dependency-free, so the settings form can import it.
 */
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "RON",
  "BAM",
  "TRY",
  "MXN",
  "BRL",
  "INR",
  "SGD",
  "HKD",
  "ZAR",
  "AED",
  "ILS",
  "THB",
  "MYR",
  "PHP",
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/** "EUR — Euro", in English, for the admin's select. */
export function currencyLabel(code: string): string {
  const name = new Intl.DisplayNames(["en"], { type: "currency", fallback: "code" }).of(code);
  return name && name !== code ? `${code} — ${name}` : code;
}
