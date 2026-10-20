import { describe, expect, it } from "vitest";

import { canonicalPostalCode, addressFormat } from "@/lib/address/formats";
import {
  BLANK_ADDRESS,
  destinationOf,
  formatAddressLines,
  readAddress,
  readAddressFields,
  validateAddress,
  type AddressRules,
  type RawAddress,
} from "@/lib/address/validate";

const rules: AddressRules = { firstName: "OPTIONAL", company: "HIDDEN", line2: "OPTIONAL", phone: "HIDDEN" };

const address = (overrides: Partial<RawAddress>): RawAddress => ({
  ...BLANK_ADDRESS,
  lastName: "Rivera",
  line1: "1 Main St",
  city: "Springfield",
  ...overrides,
});

const errorsOf = (raw: RawAddress, r: AddressRules = rules) => {
  const check = validateAddress(raw, r);
  return check.ok ? {} : check.errors;
};

describe("validateAddress, per country", () => {
  it("requires a US state from the list and a ZIP code", () => {
    expect(errorsOf(address({ countryCode: "US" }))).toEqual({ region: "required", postalCode: "required" });
    expect(errorsOf(address({ countryCode: "US", region: "ZZ", postalCode: "1234" }))).toEqual({
      region: "region",
      postalCode: "postalCode",
    });
    const check = validateAddress(address({ countryCode: "US", region: "tx", postalCode: "78701-1234" }), rules);
    expect(check.ok && check.address).toMatchObject({ regionCode: "TX", region: "Texas", postalCode: "78701-1234" });
  });

  it("puts a Canadian postal code into its canonical form", () => {
    const check = validateAddress(address({ countryCode: "CA", region: "ON", postalCode: "k1a0b1" }), rules);
    expect(check.ok && check.address.postalCode).toBe("K1A 0B1");
    expect(errorsOf(address({ countryCode: "CA", region: "ON", postalCode: "D1A 0B1" }))).toEqual({ postalCode: "postalCode" });
  });

  it.each([
    ["AU", "NSW", "2000", "2000"],
    ["MX", "CMX", "06700", "06700"],
    ["BR", "SP", "01310100", "01310-100"],
    ["IN", "MH", "400001", "400001"],
    ["JP", "13", "1000001", "100-0001"],
    ["IT", "RM", "00184", "00184"],
    ["ES", "M", "28004", "28004"],
  ])("accepts a %s address with region %s and postal code %s", (countryCode, region, postalCode, canonical) => {
    const check = validateAddress(address({ countryCode, region, postalCode }), rules);
    expect(check.ok && check.address.postalCode).toBe(canonical);
  });

  it.each([
    ["AU", "NSW", "200"],
    ["BR", "SP", "0131010"],
    ["IN", "MH", "012345"],
    ["JP", "13", "100-001"],
    ["IT", "RM", "0018"],
  ])("rejects a malformed %s postal code", (countryCode, region, postalCode) => {
    expect(errorsOf(address({ countryCode, region, postalCode }))).toEqual({ postalCode: "postalCode" });
  });

  it("requires a Japanese prefecture, an Italian province, a Spanish one", () => {
    for (const countryCode of ["JP", "IT", "ES"]) {
      expect(errorsOf(address({ countryCode, postalCode: addressFormat(countryCode).postal!.example! }))).toEqual({
        region: "required",
      });
    }
  });

  it("knows the UK postcode and puts the space back", () => {
    const check = validateAddress(address({ countryCode: "GB", postalCode: "ec1m5rn" }), rules);
    expect(check.ok && check.address).toMatchObject({ postalCode: "EC1M 5RN", region: null });
    expect(errorsOf(address({ countryCode: "GB", postalCode: "12345" }))).toEqual({ postalCode: "postalCode" });
  });

  it("takes the seed countries' formats: Dutch, Swedish, Portuguese, Czech, Irish", () => {
    const ok = (raw: Partial<RawAddress>) => {
      const check = validateAddress(address(raw), rules);
      return check.ok ? check.address.postalCode : check.errors;
    };
    expect(ok({ countryCode: "NL", postalCode: "1016gv" })).toBe("1016 GV");
    expect(ok({ countryCode: "SE", postalCode: "11623" })).toBe("116 23");
    expect(ok({ countryCode: "PT", postalCode: "1200385" })).toBe("1200-385");
    expect(ok({ countryCode: "CZ", postalCode: "120 00" })).toBe("120 00");
    expect(ok({ countryCode: "NO", postalCode: "0555" })).toBe("0555");
    // An Eircode is optional, but a wrong one is still wrong; the county is not.
    expect(ok({ countryCode: "IE", region: "G" })).toBeNull();
    expect(ok({ countryCode: "IE", region: "D", postalCode: "d02xy72" })).toBe("D02 XY72");
    expect(ok({ countryCode: "IE", region: "D", postalCode: "ZZZ" })).toEqual({ postalCode: "postalCode" });
  });

  it("asks nothing in particular of a country without a format of its own", () => {
    const check = validateAddress(address({ countryCode: "KE", region: "Nairobi" }), rules);
    expect(check.ok && check.address).toMatchObject({ regionCode: null, region: "Nairobi", postalCode: null });
  });

  it("needs a real country code", () => {
    expect(errorsOf(address({ countryCode: "" })).countryCode).toBe("required");
    expect(errorsOf(address({ countryCode: "XX" })).countryCode).toBe("country");
  });
});

describe("validateAddress, per the store's checkout settings", () => {
  const de = address({ countryCode: "DE", postalCode: "10999" });

  it("always requires the last name, the street and the city", () => {
    expect(errorsOf({ ...de, lastName: "", line1: "", city: "" })).toEqual({
      lastName: "required",
      line1: "required",
      city: "required",
    });
  });

  it("requires the first name, company and phone only when the store says so", () => {
    const strict: AddressRules = { firstName: "REQUIRED", company: "REQUIRED", line2: "OPTIONAL", phone: "REQUIRED" };
    expect(errorsOf(de, strict)).toEqual({ firstName: "required", company: "required", phone: "required" });
  });

  it("drops what a hidden field holds rather than keeping it", () => {
    const check = validateAddress({ ...de, company: "Acme", phone: "+49 30 1234567" }, rules);
    expect(check.ok && [check.address.company, check.address.phone]).toEqual([null, null]);
  });

  it("checks a phone number's shape", () => {
    const withPhone: AddressRules = { ...rules, phone: "OPTIONAL" };
    expect(errorsOf({ ...de, phone: "call me" }, withPhone)).toEqual({ phone: "phone" });
    const check = validateAddress({ ...de, phone: "+49 (30) 123-4567" }, withPhone);
    expect(check.ok && check.address.phone).toBe("+49 (30) 123-4567");
  });

  it("refuses an over-long field", () => {
    expect(errorsOf({ ...de, city: "x".repeat(121) })).toEqual({ city: "tooLong" });
  });
});

describe("destinationOf", () => {
  it("prices from the location alone — no names needed yet", () => {
    expect(destinationOf(address({ countryCode: "US", region: "NY", postalCode: "10001", lastName: "" }), rules)).toEqual({
      countryCode: "US",
      regionCode: "NY",
    });
  });

  it("waits for the parts the country requires", () => {
    expect(destinationOf(address({ countryCode: "US", postalCode: "10001" }), rules)).toBeNull();
    expect(destinationOf(address({ countryCode: "US", region: "NY", postalCode: "1" }), rules)).toBeNull();
  });
});

describe("readAddressFields", () => {
  it("reads the fields under a prefix, tidying whitespace", () => {
    const data = new FormData();
    data.set("shipping.countryCode", "us");
    data.set("shipping.line1", "  1   Main\nSt ");
    expect(readAddressFields(data, "shipping")).toMatchObject({ countryCode: "US", line1: "1 Main St", city: "" });
  });
});

describe("reading and printing stored addresses", () => {
  it("reads an order from before structured addresses", () => {
    const legacy = { name: "Ana Horvat", line1: "Ferhadija 12", line2: null, city: "Sarajevo", region: null, postalCode: "71000", country: "Bosnia and Herzegovina" };
    const read = readAddress(legacy);
    expect(read).toMatchObject({ lastName: "Ana Horvat", firstName: null, countryCode: "Bosnia and Herzegovina" });
    expect(formatAddressLines(read!, "en")).toEqual(["Ana Horvat", "Ferhadija 12", "Sarajevo, 71000", "Bosnia and Herzegovina"]);
  });

  it("prints each country's own order", () => {
    const us = readAddress({ firstName: "Ethan", lastName: "Brooks", line1: "401 Congress Avenue", city: "Austin", regionCode: "TX", region: "Texas", postalCode: "78701", countryCode: "US" });
    expect(formatAddressLines(us!, "en")).toEqual(["Ethan Brooks", "401 Congress Avenue", "Austin, TX 78701", "United States"]);

    const nl = readAddress({ firstName: "Emma", lastName: "Jansen", line1: "Prinsengracht 263", city: "Amsterdam", postalCode: "1016 GV", countryCode: "NL" });
    expect(formatAddressLines(nl!, "de")).toEqual(["Emma Jansen", "Prinsengracht 263", "1016 GV Amsterdam", "Niederlande"]);

    const jp = readAddress({ firstName: "Yui", lastName: "Sato", line1: "1-1 Chiyoda", city: "Chiyoda-ku", regionCode: "13", region: "Tokyo", postalCode: "100-0001", countryCode: "JP" });
    expect(formatAddressLines(jp!, "en")).toEqual(["Sato Yui", "1-1 Chiyoda", "Chiyoda-ku, Tokyo", "100-0001", "Japan"]);
  });

  it("reads nothing from something that is not an address", () => {
    expect(readAddress(null)).toBeNull();
    expect(readAddress([])).toBeNull();
    expect(readAddress({})).toBeNull();
  });
});

describe("canonicalPostalCode", () => {
  it("leaves a code alone when the country has no separator", () => {
    expect(canonicalPostalCode(" 10001-1234 ", addressFormat("US").postal)).toBe("10001-1234");
  });
});
