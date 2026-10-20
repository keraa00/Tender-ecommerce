import "server-only";

import { cache } from "react";

import { rootDb } from "@/lib/db/root";
import { ProductStatus, type Prisma } from "@/lib/db/types";
import { isUuid } from "@/lib/ids";
import type { ZoneRule } from "./rates";

/**
 * Shipping reads. Like every query module, each function takes `storeId`
 * first and filters by it; zone and rate ids from a URL or a form only ever
 * narrow a store-scoped lookup, so another store's id simply matches nothing.
 */

const zoneInclude = {
  countries: { orderBy: { countryCode: "asc" } },
  rates: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.ShippingZoneInclude;

/**
 * A store's zones with their countries and rates, in the seller's order, the
 * rest-of-world zone last. Deduplicated per request: checkout prices with it
 * and the page beside it lists from it.
 */
export const listShippingZones = cache(async (storeId: string) => {
  const zones = await rootDb.shippingZone.findMany({
    where: { storeId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: zoneInclude,
  });
  return [...zones.filter((zone) => !zone.restOfWorld), ...zones.filter((zone) => zone.restOfWorld)];
});

export type ShippingZoneView = Awaited<ReturnType<typeof listShippingZones>>[number];

/** The zones as the pure rate rules see them. */
export function toZoneRules(zones: readonly ShippingZoneView[]): ZoneRule[] {
  return zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    restOfWorld: zone.restOfWorld === true,
    countries: zone.countries,
    rates: zone.rates,
  }));
}

export const loadZoneRules = cache(async (storeId: string) =>
  toZoneRules(await listShippingZones(storeId)),
);

export async function getShippingZone(storeId: string, zoneId: string) {
  if (!isUuid(zoneId)) return null;
  return rootDb.shippingZone.findFirst({
    where: { id: zoneId, storeId },
    include: zoneInclude,
  });
}

export async function getShippingRate(storeId: string, zoneId: string, rateId: string) {
  if (!isUuid(zoneId) || !isUuid(rateId)) return null;
  return rootDb.shippingRate.findFirst({
    where: { id: rateId, zoneId, storeId },
    include: { zone: { select: { id: true, name: true } } },
  });
}

/**
 * Which zone each country already sits in, so the zone form can show a
 * country as taken and say where. `exceptZoneId` leaves out the zone being
 * edited — its own countries are not taken from itself.
 */
export async function zoneCountryOwners(
  storeId: string,
  exceptZoneId?: string,
): Promise<Record<string, string>> {
  const rows = await rootDb.shippingZoneCountry.findMany({
    where: { storeId, ...(exceptZoneId ? { zoneId: { not: exceptZoneId } } : {}) },
    select: { countryCode: true, zone: { select: { name: true } } },
  });
  return Object.fromEntries(rows.map((row) => [row.countryCode, row.zone.name]));
}

/**
 * Published, physical options with no weight. Weight-based rates treat them
 * as weighing nothing, which is worth telling the seller.
 */
export async function countUnweightedVariants(storeId: string): Promise<number> {
  return rootDb.variant.count({
    where: {
      storeId,
      weightGrams: 0,
      product: { status: ProductStatus.ACTIVE, requiresShipping: true },
    },
  });
}
