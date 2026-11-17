import { countryName, isCountryCode } from "@/lib/address/countries";
import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import { regionsOf } from "@/lib/address/regions";
import { parseMoneyToCents } from "@/lib/money";
import { MAX_WEIGHT_GRAMS, parseWeightToGrams } from "@/lib/weight";

/**
 * Parsing and validation for the shipping zone and rate forms. Free of
 * `server-only` and of database access so the rules are tested directly —
 * whether a country already sits in another of the store's zones is the
 * action's question, since it needs the store's other zones.
 *
 * Every rule here has a twin CHECK constraint in
 * `20261006120000_checkout_shipping`. This side exists to say what is wrong in
 * words; the constraint exists so no other write path can skip it.
 */

export const MAX_ZONE_NAME = 80;
export const MAX_RATE_NAME = 80;
/** As high as any rate should go, and clear of integer overflow. */
export const MAX_RATE_CENTS = 100_000_000;
export const MAX_DELIVERY_DAYS = 90;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function column(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim());
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export type ZoneCountryDraft = {
  countryCode: string;
  /** Empty: the whole country. */
  regionCodes: string[];
};

export type ZoneDraft = {
  name: string;
  /** Empty for a rest-of-world zone. */
  countries: ZoneCountryDraft[];
};

export type ZoneFieldErrors = Partial<Record<"name" | "countries", string>>;

export type ParsedZoneForm =
  | { ok: true; draft: ZoneDraft }
  | { ok: false; fieldErrors: ZoneFieldErrors };

/**
 * The form posts each chosen country as a repeated `country` field. A country
 * narrowed to some of its regions also posts `scope:<code>` = "some" and each
 * region as a repeated `regions:<code>`. Regions are checked against the
 * country's own list; ticking every one is the whole country, and is stored as
 * such, so a region added to the list later is not silently left out.
 */
export function parseZoneForm(
  formData: FormData,
  { restOfWorld }: { restOfWorld: boolean },
  /** The admin's copy, and its `Intl` tag for naming countries in the errors. */
  { t, intl }: { t: AdminMessages; intl: string },
): ParsedZoneForm {
  const fieldErrors: ZoneFieldErrors = {};
  const say = t.settings.shipping.errors;

  const name = field(formData, "name").replace(/\s+/g, " ");
  if (name === "") {
    fieldErrors.name = say.zoneName;
  } else if (name.length > MAX_ZONE_NAME) {
    fieldErrors.name = format(say.zoneNameTooLong, { max: MAX_ZONE_NAME });
  }

  const countries: ZoneCountryDraft[] = [];

  if (!restOfWorld) {
    const codes = [...new Set(column(formData, "country").map((code) => code.toUpperCase()))];
    const unknown = codes.find((code) => !isCountryCode(code));

    if (unknown !== undefined) {
      fieldErrors.countries = format(say.invalidCountry, { code: unknown });
    } else if (codes.length === 0) {
      fieldErrors.countries = say.noCountries;
    }

    for (const countryCode of fieldErrors.countries ? [] : codes) {
      const regions = regionsOf(countryCode);
      if (field(formData, `scope:${countryCode}`) !== "some" || !regions) {
        countries.push({ countryCode, regionCodes: [] });
        continue;
      }

      const known = new Set(regions.map((region) => region.code));
      const chosen = [...new Set(column(formData, `regions:${countryCode}`))];
      const regionCodes = chosen.filter((code) => known.has(code));

      if (regionCodes.length === 0) {
        fieldErrors.countries ??= format(say.noRegions, {
          country: countryName(countryCode, intl),
        });
        continue;
      }

      countries.push({
        countryCode,
        // Every region ticked is the whole country.
        regionCodes:
          regionCodes.length === regions.length
            ? []
            : regions.map((region) => region.code).filter((code) => regionCodes.includes(code)),
      });
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, draft: { name, countries } };
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

export type RateCondition = "none" | "subtotal" | "weight";

export type RateDraft = {
  name: string;
  priceCents: number;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
  minSubtotalCents: number | null;
  maxSubtotalCents: number | null;
  minWeightGrams: number | null;
  maxWeightGrams: number | null;
};

export type RateFieldErrors = Partial<
  Record<"name" | "price" | "delivery" | "condition", string>
>;

export type ParsedRateForm =
  | { ok: true; draft: RateDraft }
  | { ok: false; fieldErrors: RateFieldErrors };

const CONDITIONS: readonly RateCondition[] = ["none", "subtotal", "weight"];

function parseDays(raw: string): number | null | "invalid" {
  if (raw === "") return null;
  if (!/^\d{1,3}$/.test(raw)) return "invalid";
  const value = Number(raw);
  return value <= MAX_DELIVERY_DAYS ? value : "invalid";
}

/**
 * A pair of optional bounds. Blank is "no bound"; at least one is needed for
 * the condition to mean anything, and the lower may not pass the upper. Both
 * bounds are inclusive, so tiers are written 0–49.99 and 50 and up.
 */
function parseBounds(
  rawMin: string,
  rawMax: string,
  parse: (raw: string) => number | null,
  limit: number,
): { min: number | null; max: number | null } | "invalid" | "empty" | "reversed" {
  const min = rawMin === "" ? null : parse(rawMin);
  const max = rawMax === "" ? null : parse(rawMax);
  if ((rawMin !== "" && min === null) || (rawMax !== "" && max === null)) return "invalid";
  if ((min ?? 0) > limit || (max ?? 0) > limit) return "invalid";
  if (min === null && max === null) return "empty";
  if (min !== null && max !== null && min > max) return "reversed";
  return { min, max };
}

export function parseRateForm(formData: FormData, t: AdminMessages): ParsedRateForm {
  const fieldErrors: RateFieldErrors = {};
  const say = t.settings.shipping.errors;

  const name = field(formData, "name").replace(/\s+/g, " ");
  if (name === "") {
    fieldErrors.name = say.rateName;
  } else if (name.length > MAX_RATE_NAME) {
    fieldErrors.name = format(say.rateNameTooLong, { max: MAX_RATE_NAME });
  }

  const rawPrice = field(formData, "price");
  const priceCents = rawPrice === "" ? null : parseMoneyToCents(rawPrice);
  if (priceCents === null) {
    fieldErrors.price = say.price;
  } else if (priceCents > MAX_RATE_CENTS) {
    fieldErrors.price = say.priceTooLarge;
  }

  // --- Delivery estimate: a range of business days, or none -----------------

  let minDeliveryDays: number | null = null;
  let maxDeliveryDays: number | null = null;
  const minDays = parseDays(field(formData, "minDays"));
  const maxDays = parseDays(field(formData, "maxDays"));

  if (minDays === "invalid" || maxDays === "invalid") {
    fieldErrors.delivery = format(say.delivery, { max: MAX_DELIVERY_DAYS });
  } else if (minDays !== null || maxDays !== null) {
    // One number on its own is an exact estimate: "3" means 3–3.
    minDeliveryDays = minDays ?? maxDays;
    maxDeliveryDays = maxDays ?? minDays;
    if (minDeliveryDays! > maxDeliveryDays!) {
      fieldErrors.delivery = say.deliveryOrder;
    }
  }

  // --- Condition: order subtotal or total weight, never both ----------------

  const rawCondition = field(formData, "condition");
  const condition = (CONDITIONS as readonly string[]).includes(rawCondition)
    ? (rawCondition as RateCondition)
    : "none";

  let minSubtotalCents: number | null = null;
  let maxSubtotalCents: number | null = null;
  let minWeightGrams: number | null = null;
  let maxWeightGrams: number | null = null;

  if (condition !== "none") {
    const subtotal = condition === "subtotal";
    const bounds = subtotal
      ? parseBounds(field(formData, "minSubtotal"), field(formData, "maxSubtotal"), parseMoneyToCents, MAX_RATE_CENTS)
      : parseBounds(field(formData, "minWeight"), field(formData, "maxWeight"), parseWeightToGrams, MAX_WEIGHT_GRAMS);

    if (bounds === "invalid") {
      fieldErrors.condition = subtotal ? say.amounts : say.weights;
    } else if (bounds === "empty") {
      fieldErrors.condition = subtotal ? say.amountRange : say.weightRange;
    } else if (bounds === "reversed") {
      fieldErrors.condition = say.minAboveMax;
    } else if (subtotal) {
      minSubtotalCents = bounds.min;
      maxSubtotalCents = bounds.max;
    } else {
      minWeightGrams = bounds.min;
      maxWeightGrams = bounds.max;
    }
  }

  if (Object.keys(fieldErrors).length > 0 || priceCents === null) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    draft: {
      name,
      priceCents,
      minDeliveryDays,
      maxDeliveryDays,
      minSubtotalCents,
      maxSubtotalCents,
      minWeightGrams,
      maxWeightGrams,
    },
  };
}
