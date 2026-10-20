import { describe, expect, it } from "vitest";

import {
  chooseRate,
  eligibleRates,
  rateApplies,
  shipsAnywhere,
  shipsTo,
  zoneFor,
  type RateRule,
  type ZoneRule,
} from "@/lib/shipping/rates";

let nextId = 0;
function rate(overrides: Partial<RateRule> = {}): RateRule {
  nextId += 1;
  return {
    id: `r${nextId}`,
    name: "Standard",
    priceCents: 500,
    minDeliveryDays: null,
    maxDeliveryDays: null,
    minSubtotalCents: null,
    maxSubtotalCents: null,
    minWeightGrams: null,
    maxWeightGrams: null,
    position: 0,
    ...overrides,
  };
}

function zone(name: string, countries: ZoneRule["countries"], rates: RateRule[] = [rate()], restOfWorld = false): ZoneRule {
  return { id: `z-${name}`, name, restOfWorld, countries, rates };
}

const nordics = zone("Nordics", [
  { countryCode: "NO", regionCodes: [] },
  { countryCode: "SE", regionCodes: [] },
]);
const contiguous = zone("North America", [
  { countryCode: "US", regionCodes: ["CA", "NY", "TX"] },
  { countryCode: "CA", regionCodes: [] },
]);
const world = zone("Rest of world", [], [rate({ priceCents: 3500 })], true);

describe("zoneFor", () => {
  it("finds the zone that names the country", () => {
    expect(zoneFor([nordics, contiguous], { countryCode: "SE", regionCode: null })).toBe(nordics);
  });

  it("matches a narrowed country only in the regions it lists", () => {
    expect(zoneFor([contiguous], { countryCode: "US", regionCode: "TX" })).toBe(contiguous);
    expect(zoneFor([contiguous], { countryCode: "US", regionCode: "AK" })).toBeNull();
    expect(zoneFor([contiguous], { countryCode: "US", regionCode: null })).toBeNull();
  });

  it("does not hand a narrowed country's other regions to rest of world", () => {
    // Alaska is left out on purpose; "everywhere else" means other countries.
    expect(zoneFor([contiguous, world], { countryCode: "US", regionCode: "AK" })).toBeNull();
  });

  it("falls back to rest of world for a country no zone names", () => {
    expect(zoneFor([nordics, world], { countryCode: "JP", regionCode: "13" })).toBe(world);
    expect(zoneFor([world, nordics], { countryCode: "NO", regionCode: null })).toBe(nordics);
  });

  it("is null where the store does not ship", () => {
    expect(zoneFor([nordics], { countryCode: "FR", regionCode: null })).toBeNull();
    expect(zoneFor([], { countryCode: "FR", regionCode: null })).toBeNull();
  });
});

describe("rate conditions", () => {
  const tier = rate({ minSubtotalCents: 5000, maxSubtotalCents: 9999 });
  const light = rate({ maxWeightGrams: 2000 });

  it("includes both ends of a range", () => {
    expect(rateApplies(tier, { subtotalCents: 5000, weightGrams: 0 })).toBe(true);
    expect(rateApplies(tier, { subtotalCents: 9999, weightGrams: 0 })).toBe(true);
    expect(rateApplies(tier, { subtotalCents: 4999, weightGrams: 0 })).toBe(false);
    expect(rateApplies(tier, { subtotalCents: 10_000, weightGrams: 0 })).toBe(false);
  });

  it("judges weight against what ships", () => {
    expect(rateApplies(light, { subtotalCents: 0, weightGrams: 2000 })).toBe(true);
    expect(rateApplies(light, { subtotalCents: 0, weightGrams: 2001 })).toBe(false);
  });

  it("applies a rate with no condition to every order", () => {
    expect(rateApplies(rate(), { subtotalCents: 0, weightGrams: 1_000_000 })).toBe(true);
  });
});

describe("eligibleRates and chooseRate", () => {
  const standard = rate({ name: "Standard", priceCents: 900, position: 0 });
  const express = rate({ name: "Express", priceCents: 1900, position: 1 });
  const free = rate({ name: "Free over 100", priceCents: 0, position: 2, minSubtotalCents: 10_000 });
  const heavy = rate({ name: "Heavy", priceCents: 2900, position: 3, minWeightGrams: 2001 });
  const options = zone("Z", [{ countryCode: "NO", regionCodes: [] }], [express, heavy, standard, free]);

  it("lists what the order qualifies for, cheapest first", () => {
    expect(eligibleRates(options, { subtotalCents: 4000, weightGrams: 500 }).map((r) => r.name)).toEqual([
      "Standard",
      "Express",
    ]);
    expect(eligibleRates(options, { subtotalCents: 12_000, weightGrams: 3000 }).map((r) => r.name)).toEqual([
      "Free over 100",
      "Standard",
      "Express",
      "Heavy",
    ]);
  });

  it("orders equal prices by the seller's position", () => {
    const a = rate({ name: "A", priceCents: 500, position: 1 });
    const b = rate({ name: "B", priceCents: 500, position: 0 });
    expect(eligibleRates(zone("Z", [], [a, b]), { subtotalCents: 0, weightGrams: 0 }).map((r) => r.name)).toEqual(["B", "A"]);
  });

  it("keeps the buyer's pick while it still applies, else falls back to the cheapest", () => {
    const eligible = eligibleRates(options, { subtotalCents: 4000, weightGrams: 500 });
    expect(chooseRate(eligible, express.id)).toBe(express);
    expect(chooseRate(eligible, null)).toBe(standard);
    // Grown out of: the free rate needs £100.
    expect(chooseRate(eligible, free.id)).toBe(standard);
    // Another zone's or another store's id is not in the list at all.
    expect(chooseRate(eligible, "r-from-elsewhere")).toBe(standard);
    expect(chooseRate([], express.id)).toBeNull();
  });
});

describe("where a store ships", () => {
  it("is exactly the countries its zones name, once each", () => {
    const overlap = zone("More", [{ countryCode: "NO", regionCodes: [] }, { countryCode: "DK", regionCodes: [] }]);
    expect(shipsTo([nordics, overlap])).toEqual({ everywhere: false, countryCodes: ["DK", "NO", "SE"] });
  });

  it("is everywhere with a rest-of-world zone", () => {
    expect(shipsTo([nordics, world])).toEqual({ everywhere: true, countryCodes: null });
  });

  it("ships nowhere until some zone has a rate", () => {
    expect(shipsAnywhere([])).toBe(false);
    expect(shipsAnywhere([zone("Empty", [{ countryCode: "NO", regionCodes: [] }], [])])).toBe(false);
    expect(shipsAnywhere([nordics])).toBe(true);
    expect(shipsAnywhere([world])).toBe(true);
  });
});
