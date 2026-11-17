"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth/session";
import { rootDb } from "@/lib/db/root";
import { StoreStatus } from "@/lib/db/types";
import { isUuid } from "@/lib/ids";
import { statusAfterSuspension } from "@/lib/stores/policy";

/**
 * The platform admin's moderation moves on any store. Each one checks the
 * caller itself — a Server Action is a public endpoint, and the page that
 * shows the buttons proves nothing about who posts to it — and takes the
 * store id from the form, which is fine for a platform admin: every store is
 * theirs to act on.
 */

const PLATFORM_PATH = "/dashboard/platform";

/** The pages a store's moderation shows on: the platform list, home and /stores. */
function revalidateModeration() {
  revalidatePath(PLATFORM_PATH);
  revalidatePath("/");
  revalidatePath("/stores");
}

/** Shown on the landing page and /stores, or taken off them. */
export async function setStoreFeaturedAction(storeId: string, featured: boolean): Promise<void> {
  await requirePlatformAdmin(PLATFORM_PATH);
  if (!isUuid(storeId)) return;

  await rootDb.store.updateMany({ where: { id: storeId }, data: { featured } });
  revalidateModeration();
}

/**
 * Takes a store off the platform: its storefront 404s and checkout refuses it
 * (`isStorePubliclyVisible`, `checkoutBlockedReason`). Its data is untouched,
 * and the owner still reaches its admin. Conditional, so suspending twice is
 * the same as once.
 */
export async function suspendStoreAction(storeId: string): Promise<void> {
  await requirePlatformAdmin(PLATFORM_PATH);
  if (!isUuid(storeId)) return;

  await rootDb.store.updateMany({
    where: { id: storeId, status: { not: StoreStatus.SUSPENDED } },
    data: { status: StoreStatus.SUSPENDED },
  });
  revalidateModeration();
}

/**
 * Lifts a suspension. The store goes back to trading if it has a way to be
 * paid, or to waiting for setup if not (`statusAfterSuspension`) — the status
 * it had before is not kept, and does not need to be.
 */
export async function unsuspendStoreAction(storeId: string): Promise<void> {
  await requirePlatformAdmin(PLATFORM_PATH);
  if (!isUuid(storeId)) return;

  const store = await rootDb.store.findFirst({
    where: { id: storeId, status: StoreStatus.SUSPENDED },
    select: {
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      stripeChargesEnabled: true,
      codEnabled: true,
    },
  });
  if (!store) return;

  await rootDb.store.updateMany({
    where: { id: storeId, status: StoreStatus.SUSPENDED },
    data: { status: statusAfterSuspension(store) },
  });
  revalidateModeration();
}
