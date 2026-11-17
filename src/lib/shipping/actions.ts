"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { countryName } from "@/lib/address/countries";
import { format } from "@/lib/i18n/format";
import { getAdminI18n, type AdminI18n } from "@/lib/i18n/server";
import { storeAdminPath } from "@/lib/admin/links";
import { rootDb } from "@/lib/db/root";
import { Prisma } from "@/lib/db/types";
import { isUuid } from "@/lib/ids";
import { getStoreContext } from "@/lib/stores/context";
import {
  parseRateForm,
  parseZoneForm,
  type RateFieldErrors,
  type ZoneDraft,
  type ZoneFieldErrors,
} from "./form";

/**
 * Shipping zone and rate writes. The store comes from the URL plus the
 * session; zone and rate ids come from the URL too, bound on the server, and
 * every one is looked up with the store's id beside it before anything is
 * written. Countries are checked against the ISO list by the parser and
 * against the store's other zones here.
 */

export type ZoneFormState = {
  formError?: string;
  notice?: string;
  fieldErrors?: ZoneFieldErrors;
};

export type RateFormState = {
  formError?: string;
  notice?: string;
  fieldErrors?: RateFieldErrors;
};


function revalidateShipping(storeSlug: string) {
  // Internal route paths, not admin-host URLs — see `lib/products/actions.ts`.
  // "layout" reaches every zone and rate page beneath it as well.
  revalidatePath(`/dashboard/${storeSlug}/settings/shipping`, "layout");
  // The home page's setup checklist counts zones too.
  revalidatePath(`/dashboard/${storeSlug}`);
}

function shippingPath(storeSlug: string, tail = "") {
  return storeAdminPath(storeSlug, `settings/shipping${tail}`);
}

/** A unique-constraint violation: here, a country another zone took first. */
function isTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Names the first country in the draft that already belongs to another of the
 * store's zones, and which. The composite primary key on (store, country) is
 * the real guard; this turns it into a sentence before the write.
 */
async function takenCountry(
  storeId: string,
  draft: ZoneDraft,
  exceptZoneId: string | null,
  { t, intl }: AdminI18n,
): Promise<string | null> {
  if (draft.countries.length === 0) return null;
  const clash = await rootDb.shippingZoneCountry.findFirst({
    where: {
      storeId,
      countryCode: { in: draft.countries.map((country) => country.countryCode) },
      ...(exceptZoneId ? { zoneId: { not: exceptZoneId } } : {}),
    },
    orderBy: { countryCode: "asc" },
    select: { countryCode: true, zone: { select: { name: true } } },
  });
  return clash
    ? format(t.settings.shipping.errors.clash, {
        country: countryName(clash.countryCode, intl),
        zone: clash.zone.name,
      })
    : null;
}


// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export async function createZoneAction(
  storeSlug: string,
  restOfWorld: boolean,
  _prev: ZoneFormState,
  formData: FormData,
): Promise<ZoneFormState> {
  const [{ store }, i18n] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  const say = i18n.t.settings.shipping.errors;

  const parsed = parseZoneForm(formData, { restOfWorld }, i18n);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  const { draft } = parsed;

  const taken = await takenCountry(store.id, draft, null, i18n);
  if (taken) return { fieldErrors: { countries: taken } };

  let zoneId: string;
  try {
    zoneId = await rootDb.$transaction(async (tx) => {
      const last = await tx.shippingZone.aggregate({
        where: { storeId: store.id },
        _max: { position: true },
      });
      const zone = await tx.shippingZone.create({
        data: {
          storeId: store.id,
          name: draft.name,
          restOfWorld: restOfWorld ? true : null,
          position: (last._max.position ?? -1) + 1,
        },
        select: { id: true },
      });
      if (draft.countries.length > 0) {
        await tx.shippingZoneCountry.createMany({
          data: draft.countries.map((country) => ({
            ...country,
            storeId: store.id,
            zoneId: zone.id,
          })),
        });
      }
      return zone.id;
    });
  } catch (error) {
    if (isTaken(error)) {
      return restOfWorld
        ? { formError: say.restOfWorldExists }
        : { fieldErrors: { countries: say.raced } };
    }
    console.error("createZoneAction failed", error);
    return { formError: say.saveFailed };
  }

  revalidateShipping(storeSlug);
  // Outside the try block: redirect() signals by throwing.
  redirect(`${shippingPath(storeSlug, `/zones/${zoneId}`)}?created=1`);
}

export async function updateZoneAction(
  storeSlug: string,
  zoneId: string,
  _prev: ZoneFormState,
  formData: FormData,
): Promise<ZoneFormState> {
  const [{ store }, i18n] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  const say = i18n.t.settings.shipping.errors;
  if (!isUuid(zoneId)) notFound();

  const zone = await rootDb.shippingZone.findFirst({
    where: { id: zoneId, storeId: store.id },
    select: { id: true, restOfWorld: true },
  });
  if (!zone) notFound();

  const parsed = parseZoneForm(formData, { restOfWorld: zone.restOfWorld === true }, i18n);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  const { draft } = parsed;

  const taken = await takenCountry(store.id, draft, zone.id, i18n);
  if (taken) return { fieldErrors: { countries: taken } };

  try {
    await rootDb.$transaction(async (tx) => {
      await tx.shippingZone.update({ where: { id: zone.id }, data: { name: draft.name } });
      // The form posts every country each time, so replacing them is the
      // simplest write and cannot leave a stale one behind.
      await tx.shippingZoneCountry.deleteMany({ where: { storeId: store.id, zoneId: zone.id } });
      if (draft.countries.length > 0) {
        await tx.shippingZoneCountry.createMany({
          data: draft.countries.map((country) => ({
            ...country,
            storeId: store.id,
            zoneId: zone.id,
          })),
        });
      }
    });
  } catch (error) {
    if (isTaken(error)) return { fieldErrors: { countries: say.raced } };
    console.error("updateZoneAction failed", error);
    return { formError: say.saveFailed };
  }

  revalidateShipping(storeSlug);
  return { notice: i18n.t.settings.shipping.saved };
}

export async function deleteZoneAction(storeSlug: string, zoneId: string): Promise<void> {
  const { store } = await getStoreContext(storeSlug);
  if (!isUuid(zoneId)) notFound();

  let deleted = 0;
  try {
    // Countries and rates cascade. Orders keep their snapshot of the rate and
    // lose only the link; carts that had picked one fall back to the cheapest.
    ({ count: deleted } = await rootDb.shippingZone.deleteMany({
      where: { id: zoneId, storeId: store.id },
    }));
  } catch (error) {
    console.error("deleteZoneAction failed", error);
    redirect(`${shippingPath(storeSlug, `/zones/${zoneId}`)}?error=delete-failed`);
  }

  if (deleted === 0) notFound();

  revalidateShipping(storeSlug);
  redirect(shippingPath(storeSlug));
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

async function ownZone(storeId: string, zoneId: string) {
  if (!isUuid(zoneId)) notFound();
  const zone = await rootDb.shippingZone.findFirst({
    where: { id: zoneId, storeId },
    select: { id: true },
  });
  if (!zone) notFound();
  return zone;
}

export async function createRateAction(
  storeSlug: string,
  zoneId: string,
  _prev: RateFormState,
  formData: FormData,
): Promise<RateFormState> {
  const [{ store }, i18n] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  const say = i18n.t.settings.shipping.errors;
  const zone = await ownZone(store.id, zoneId);

  const parsed = parseRateForm(formData, i18n.t);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  try {
    const last = await rootDb.shippingRate.aggregate({
      where: { storeId: store.id, zoneId: zone.id },
      _max: { position: true },
    });
    await rootDb.shippingRate.create({
      data: {
        storeId: store.id,
        zoneId: zone.id,
        ...parsed.draft,
        position: (last._max.position ?? -1) + 1,
      },
    });
  } catch (error) {
    console.error("createRateAction failed", error);
    return { formError: say.saveFailed };
  }

  revalidateShipping(storeSlug);
  redirect(`${shippingPath(storeSlug, `/zones/${zone.id}`)}?rate=created`);
}

export async function updateRateAction(
  storeSlug: string,
  zoneId: string,
  rateId: string,
  _prev: RateFormState,
  formData: FormData,
): Promise<RateFormState> {
  const [{ store }, i18n] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  const say = i18n.t.settings.shipping.errors;
  if (!isUuid(zoneId) || !isUuid(rateId)) notFound();

  const parsed = parseRateForm(formData, i18n.t);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  let updated = 0;
  try {
    // Scoped by store and zone as well as id: a rate id from another zone, or
    // another store, updates nothing.
    ({ count: updated } = await rootDb.shippingRate.updateMany({
      where: { id: rateId, zoneId, storeId: store.id },
      data: parsed.draft,
    }));
  } catch (error) {
    console.error("updateRateAction failed", error);
    return { formError: say.saveFailed };
  }

  // Outside the try block, like redirect(): notFound() signals by throwing.
  if (updated === 0) notFound();

  revalidateShipping(storeSlug);
  return { notice: i18n.t.settings.shipping.saved };
}

export async function deleteRateAction(
  storeSlug: string,
  zoneId: string,
  rateId: string,
): Promise<void> {
  const { store } = await getStoreContext(storeSlug);
  if (!isUuid(zoneId) || !isUuid(rateId)) notFound();

  let deleted = 0;
  try {
    ({ count: deleted } = await rootDb.shippingRate.deleteMany({
      where: { id: rateId, zoneId, storeId: store.id },
    }));
  } catch (error) {
    console.error("deleteRateAction failed", error);
    redirect(`${shippingPath(storeSlug, `/zones/${zoneId}/rates/${rateId}`)}?error=delete-failed`);
  }

  if (deleted === 0) notFound();

  revalidateShipping(storeSlug);
  redirect(shippingPath(storeSlug, `/zones/${zoneId}`));
}
