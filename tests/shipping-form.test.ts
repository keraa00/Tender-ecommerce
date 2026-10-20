import { describe, expect, it } from "vitest";

import { parseRateForm, parseZoneForm } from "@/lib/shipping/form";

function data(entries: [string, string][]): FormData {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

describe("parseZoneForm", () => {
  it("reads a name and the chosen countries, de-duplicated and upper-cased", () => {
    const result = parseZoneForm(
      data([
        ["name", "  Nordics  "],
        ["country", "no"],
        ["country", "SE"],
        ["country", "NO"],
      ]),
      { restOfWorld: false },
    );
    expect(result).toEqual({
      ok: true,
      draft: {
        name: "Nordics",
        countries: [
          { countryCode: "NO", regionCodes: [] },
          { countryCode: "SE", regionCodes: [] },
        ],
      },
    });
  });

  it("needs a name and at least one country", () => {
    const result = parseZoneForm(data([["name", ""]]), { restOfWorld: false });
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.fieldErrors).sort()).toEqual(["countries", "name"]);
  });

  it("refuses a code that is not an ISO country", () => {
    const result = parseZoneForm(data([["name", "Z"], ["country", "XX"]]), { restOfWorld: false });
    expect(!result.ok && result.fieldErrors.countries).toBe('"XX" is not a country code.');
  });

  it("narrows a country to the regions chosen, in the list's order, dropping unknown ones", () => {
    const result = parseZoneForm(
      data([
        ["name", "West coast"],
        ["country", "US"],
        ["scope:US", "some"],
        ["regions:US", "WA"],
        ["regions:US", "CA"],
        ["regions:US", "ZZ"],
        ["regions:US", "OR"],
      ]),
      { restOfWorld: false },
    );
    expect(result.ok && result.draft.countries).toEqual([
      { countryCode: "US", regionCodes: ["CA", "OR", "WA"] },
    ]);
  });

  it("stores every region ticked as the whole country", () => {
    const regions = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];
    const result = parseZoneForm(
      data([
        ["name", "Australia"],
        ["country", "AU"],
        ["scope:AU", "some"],
        ...regions.map((code): [string, string] => ["regions:AU", code]),
      ]),
      { restOfWorld: false },
    );
    expect(result.ok && result.draft.countries).toEqual([{ countryCode: "AU", regionCodes: [] }]);
  });

  it("asks for a region when a country is narrowed to none", () => {
    const result = parseZoneForm(
      data([["name", "Z"], ["country", "CA"], ["scope:CA", "some"]]),
      { restOfWorld: false },
    );
    expect(!result.ok && result.fieldErrors.countries).toBe(
      "Choose at least one region in Canada, or ship to all of it.",
    );
  });

  it("ignores a region scope on a country without a region list", () => {
    const result = parseZoneForm(
      data([["name", "Z"], ["country", "FR"], ["scope:FR", "some"], ["regions:FR", "75"]]),
      { restOfWorld: false },
    );
    expect(result.ok && result.draft.countries).toEqual([{ countryCode: "FR", regionCodes: [] }]);
  });

  it("keeps no countries on a rest-of-world zone, whatever was posted", () => {
    const result = parseZoneForm(data([["name", "Rest of world"], ["country", "FR"]]), {
      restOfWorld: true,
    });
    expect(result).toEqual({ ok: true, draft: { name: "Rest of world", countries: [] } });
  });
});

describe("parseRateForm", () => {
  const base: [string, string][] = [
    ["name", "Standard"],
    ["price", "4.90"],
  ];

  it("reads a plain rate with no estimate and no condition", () => {
    expect(parseRateForm(data(base))).toEqual({
      ok: true,
      draft: {
        name: "Standard",
        priceCents: 490,
        minDeliveryDays: null,
        maxDeliveryDays: null,
        minSubtotalCents: null,
        maxSubtotalCents: null,
        minWeightGrams: null,
        maxWeightGrams: null,
      },
    });
  });

  it("allows a free rate, but not a missing price", () => {
    const free = parseRateForm(data([["name", "Free"], ["price", "0"]]));
    expect(free.ok && free.draft.priceCents).toBe(0);
    const blank = parseRateForm(data([["name", "Free"], ["price", ""]]));
    expect(!blank.ok && blank.fieldErrors.price).toBeDefined();
  });

  it("reads one estimate number as an exact estimate", () => {
    const result = parseRateForm(data([...base, ["minDays", ""], ["maxDays", "3"]]));
    expect(result.ok && [result.draft.minDeliveryDays, result.draft.maxDeliveryDays]).toEqual([3, 3]);
  });

  it("refuses an estimate that runs backwards or past 90 days", () => {
    const backwards = parseRateForm(data([...base, ["minDays", "5"], ["maxDays", "2"]]));
    expect(!backwards.ok && backwards.fieldErrors.delivery).toBeDefined();
    const long = parseRateForm(data([...base, ["minDays", "5"], ["maxDays", "91"]]));
    expect(!long.ok && long.fieldErrors.delivery).toBeDefined();
  });

  it("keeps only the chosen condition's bounds", () => {
    const result = parseRateForm(
      data([
        ...base,
        ["condition", "subtotal"],
        ["minSubtotal", "50"],
        ["maxSubtotal", ""],
        ["minWeight", "2"],
      ]),
    );
    expect(result.ok && result.draft).toMatchObject({
      minSubtotalCents: 5000,
      maxSubtotalCents: null,
      minWeightGrams: null,
      maxWeightGrams: null,
    });
  });

  it("reads weight bounds in kilograms as grams", () => {
    const result = parseRateForm(
      data([...base, ["condition", "weight"], ["minWeight", "2.001"], ["maxWeight", "20"]]),
    );
    expect(result.ok && [result.draft.minWeightGrams, result.draft.maxWeightGrams]).toEqual([
      2001, 20000,
    ]);
  });

  it("needs at least one bound, in order, for a condition", () => {
    const empty = parseRateForm(data([...base, ["condition", "weight"]]));
    expect(!empty.ok && empty.fieldErrors.condition).toMatch(/minimum weight/);
    const reversed = parseRateForm(
      data([...base, ["condition", "subtotal"], ["minSubtotal", "100"], ["maxSubtotal", "50"]]),
    );
    expect(!reversed.ok && reversed.fieldErrors.condition).toBe(
      "The minimum can't be more than the maximum.",
    );
  });
});
