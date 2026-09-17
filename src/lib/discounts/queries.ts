import "server-only";

import { rootDb } from "@/lib/db/root";

/** Seller-admin discount reads, scoped by `storeId` like every other module. */
export async function listStoreDiscounts(storeId: string) {
  return rootDb.discount.findMany({
    where: { storeId },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
}

export type StoreDiscount = Awaited<
  ReturnType<typeof listStoreDiscounts>
>[number];
