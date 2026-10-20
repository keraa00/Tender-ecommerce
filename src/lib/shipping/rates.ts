import type { ShippingDestination } from "@/lib/address/types";

/**
 * Which shipping rates an order can choose from. Pure and dependency-free:
 * checkout, the order transaction, the admin and the seed all decide it here,
 * so the rate a buyer is shown is the rate they are charged, and the rules are
 * tested without a database.
 *
 * The order of questions:
 *   1. Which zone is the address in? A zone that names the country wins; a
 *      country named nowhere falls to the rest-of-world zone, if there is one.
 *   2. Which of that zone's rates does the order meet the conditions of?
 *   3. Which one did the buyer pick? A pick that no longer applies — the cart
 *      changed, the address moved, the seller deleted it — falls back to the
 *      cheapest, rather than to an error the buyer has to clear.
 */

export type RateRule = {
  id: string;
  name: string;
  priceCents: number;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
  minSubtotalCents: number | null;
  maxSubtotalCents: number | null;
  minWeightGrams: number | null;
  maxWeightGrams: number | null;
  position: number;
};

export type ZoneCountryRule = {
  countryCode: string;
  /** Empty: the whole country. */
  regionCodes: readonly string[];
};

export type ZoneRule = {
  id: string;
  name: string;
  restOfWorld: boolean;
  /** Empty for the rest-of-world zone, which covers what no other zone names. */
  countries: readonly ZoneCountryRule[];
  rates: readonly RateRule[];
};

/** What a rate's conditions are judged against. */
export type OrderMeasure = {
  /** After item discounts, before shipping. */
  subtotalCents: number;
  /** Lines that require shipping only. */
  weightGrams: number;
};

/**
 * The zone an address falls in, or null when the store does not ship there.
 *
 * A country named by a zone is claimed by it, all of it: when the zone covers
 * only some regions, the others are not shipped to — the rest-of-world zone
 * does not pick them up. That keeps "one zone per country" true for buyers as
 * well as in the database.
 */
export function zoneFor(
  zones: readonly ZoneRule[],
  destination: ShippingDestination,
): ZoneRule | null {
  for (const zone of zones) {
    if (zone.restOfWorld) continue;
    const entry = zone.countries.find(
      (country) => country.countryCode === destination.countryCode,
    );
    if (!entry) continue;
    if (entry.regionCodes.length === 0) return zone;
    return destination.regionCode !== null && entry.regionCodes.includes(destination.regionCode)
      ? zone
      : null;
  }

  return zones.find((zone) => zone.restOfWorld) ?? null;
}

/** Both bounds inclusive; a missing bound is no bound. */
function within(value: number, min: number | null, max: number | null): boolean {
  return (min === null || value >= min) && (max === null || value <= max);
}

export function rateApplies(rate: RateRule, measure: OrderMeasure): boolean {
  return (
    within(measure.subtotalCents, rate.minSubtotalCents, rate.maxSubtotalCents) &&
    within(measure.weightGrams, rate.minWeightGrams, rate.maxWeightGrams)
  );
}

/** The rates the order qualifies for, cheapest first, then in the seller's order. */
export function eligibleRates(zone: ZoneRule, measure: OrderMeasure): RateRule[] {
  return zone.rates
    .filter((rate) => rateApplies(rate, measure))
    .sort((a, b) => a.priceCents - b.priceCents || a.position - b.position);
}

/**
 * The rate to charge: the one asked for when it is among `rates`, else the
 * cheapest. `rates` is the eligible list, so an id from another zone or another
 * store is simply not found.
 */
export function chooseRate(
  rates: readonly RateRule[],
  requestedId: string | null,
): RateRule | null {
  return rates.find((rate) => rate.id === requestedId) ?? rates[0] ?? null;
}

export type ShipsTo =
  | { everywhere: true; countryCodes: null }
  /** Sorted, distinct. */
  | { everywhere: false; countryCodes: string[] };

/**
 * The countries a store sells to: exactly those its zones cover. A
 * rest-of-world zone covers every country.
 */
export function shipsTo(zones: readonly ZoneRule[]): ShipsTo {
  if (zones.some((zone) => zone.restOfWorld)) return { everywhere: true, countryCodes: null };
  const codes = new Set(zones.flatMap((zone) => zone.countries.map((entry) => entry.countryCode)));
  return { everywhere: false, countryCodes: [...codes].sort() };
}

/** Whether any order could be shipped at all: some zone has a rate to offer. */
export function shipsAnywhere(zones: readonly ZoneRule[]): boolean {
  return zones.some(
    (zone) => zone.rates.length > 0 && (zone.restOfWorld || zone.countries.length > 0),
  );
}
