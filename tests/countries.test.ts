import { describe, expect, it } from "vitest";

import { COUNTRY_CODES, countryOptions, DELIVERABLE_COUNTRY_CODES } from "@/lib/address/countries";
import { addressFormat, FORMATTED_COUNTRIES } from "@/lib/address/formats";
import { REGIONS } from "@/lib/address/regions";
import { acceptLanguageRegions, preferredCountry } from "@/lib/checkout/country";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { parseWeightToGrams, gramsToInputValue } from "@/lib/weight";

describe("the country and region data", () => {
  it("lists each ISO country once, and Intl can name every one", () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    expect(COUNTRY_CODES.length).toBe(249);
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (const code of COUNTRY_CODES) expect(names.of(code)).not.toBe(code);
  });

  it("offers rest of world only inhabited places", () => {
    expect(DELIVERABLE_COUNTRY_CODES).not.toContain("AQ");
    expect(DELIVERABLE_COUNTRY_CODES).toContain("FR");
  });

  it("names and sorts countries in the reader's language", () => {
    expect(countryOptions(["DE", "AT"], "de")).toEqual([
      { code: "DE", name: "Deutschland" },
      { code: "AT", name: "Österreich" },
    ]);
  });

  it("keeps region codes unique and shaped as the database requires", () => {
    for (const [country, regions] of Object.entries(REGIONS)) {
      const codes = regions.map((region) => region.code);
      expect(new Set(codes).size, country).toBe(codes.length);
      for (const code of codes) expect(code).toMatch(/^[A-Z0-9]{1,3}$/);
      for (const region of regions) expect(region.name.length).toBeGreaterThan(0);
    }
    expect(REGIONS.US).toHaveLength(51);
    expect(REGIONS.JP).toHaveLength(47);
    expect(REGIONS.CA).toHaveLength(13);
  });

  it("gives every country with a region list a format that asks for it", () => {
    for (const country of Object.keys(REGIONS)) expect(addressFormat(country).region, country).not.toBeNull();
  });

  it("covers the countries the brief and the seed need", () => {
    for (const code of ["US", "CA", "AU", "MX", "BR", "IN", "JP", "IT", "ES", "AT", "BE", "CZ", "DK", "FI", "FR", "DE", "IE", "NL", "NO", "PT", "SE", "GB"]) {
      expect(FORMATTED_COUNTRIES).toContain(code);
    }
  });

  it("matches every format's example against its own pattern", () => {
    for (const code of FORMATTED_COUNTRIES) {
      const postal = addressFormat(code).postal;
      if (postal?.pattern && postal.example) expect(postal.example, code).toMatch(new RegExp(postal.pattern));
    }
  });
});

describe("currencies", () => {
  it("offers only currencies with exactly two minor digits, as integer cents needs", () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
      expect(digits, currency).toBe(2);
    }
  });
});

describe("weights", () => {
  it("reads kilograms as whole grams without floating-point drift", () => {
    expect(parseWeightToGrams("0.35")).toBe(350);
    expect(parseWeightToGrams("0.035")).toBe(35);
    expect(parseWeightToGrams("1,5 kg")).toBe(1500);
    expect(parseWeightToGrams("2")).toBe(2000);
    expect(parseWeightToGrams("0.0005")).toBe(1);
    expect(parseWeightToGrams("abc")).toBeNull();
    expect(parseWeightToGrams("-1")).toBeNull();
    expect(gramsToInputValue(1005)).toBe("1.005");
  });
});

describe("the default country at checkout", () => {
  it("reads regions from Accept-Language by preference", () => {
    expect(acceptLanguageRegions("de;q=0.5, en-GB, fr-CA;q=0.9, zh-Hant-TW;q=0.4, es-419")).toEqual(["GB", "CA", "TW"]);
    expect(acceptLanguageRegions(null)).toEqual([]);
  });

  const base = { saved: null, acceptLanguage: null, locale: "en-US", shipsTo: ["DE", "GB", "NO"], fallback: "NO" };

  it("keeps the buyer's own choice first", () => {
    expect(preferredCountry({ ...base, saved: "GB", acceptLanguage: "de-DE" })).toBe("GB");
  });

  it("then the browser's region, if the store ships there", () => {
    expect(preferredCountry({ ...base, acceptLanguage: "fr-FR, de-DE;q=0.8" })).toBe("DE");
  });

  it("then the storefront language's region, then the store's home", () => {
    expect(preferredCountry({ ...base, locale: "en-GB" })).toBe("GB");
    expect(preferredCountry({ ...base, acceptLanguage: "ja-JP" })).toBe("NO");
  });

  it("never suggests a country the store does not ship to", () => {
    expect(preferredCountry({ ...base, saved: "FR", fallback: "FR" })).toBe("DE");
    expect(preferredCountry({ ...base, shipsTo: null, saved: null, acceptLanguage: "pt-BR" })).toBe("BR");
  });
});
