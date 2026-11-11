import "server-only";

import { rootDb } from "@/lib/db/root";

/**
 * Account-level reads. These are about the person, not a tenant, so they are
 * among `rootDb`'s legitimate callers: every one is filtered by the signed-in
 * user's own id.
 */

/**
 * Stores this user owns. While there are any, the account cannot be deleted —
 * `stores.owner_id` is `ON DELETE RESTRICT` — and each one has to be deleted
 * from its own Settings first.
 */
export async function listOwnedStores(userId: string) {
  return rootDb.store.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, contactEmail: true },
  });
}

/**
 * The rows behind "Download my data", shaped by `buildAccountExport()`. Orders
 * are the ones placed while signed in to this account — linked by `user_id` —
 * not every order that happens to carry the same email address.
 */
export async function getAccountExportData(userId: string) {
  const [memberships, orders] = await Promise.all([
    rootDb.storeMember.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        createdAt: true,
        store: { select: { name: true, slug: true } },
      },
    }),
    rootDb.order.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        orderNumber: true,
        status: true,
        paymentMethod: true,
        currency: true,
        email: true,
        subtotalCents: true,
        discountCents: true,
        shippingCents: true,
        paymentFeeCents: true,
        totalCents: true,
        shippingAddress: true,
        billingAddress: true,
        shippingRateName: true,
        note: true,
        marketingConsent: true,
        createdAt: true,
        paidAt: true,
        fulfilledAt: true,
        cancelledAt: true,
        store: { select: { name: true, slug: true } },
        lines: {
          orderBy: { id: "asc" },
          select: {
            titleSnapshot: true,
            variantTitleSnapshot: true,
            skuSnapshot: true,
            unitPriceCents: true,
            quantity: true,
            discountCents: true,
          },
        },
      },
    }),
  ]);

  return { memberships, orders };
}
