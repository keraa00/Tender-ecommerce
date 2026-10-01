import "server-only";

import type { Prisma } from "@/lib/db/types";

/**
 * Recording that an order used its discounts — the one place usage limits are
 * enforced for real.
 *
 * The engine checks limits against counts it read earlier, which is right for
 * showing a buyer their total and wrong for taking the order: two checkouts can
 * both read "99 of 100 used". So checkout calls `redeemDiscounts` inside the
 * transaction that creates the order, and a limit reached in the meantime
 * throws and rolls the order back rather than over-spending the discount.
 *
 * The increment goes first and is conditional — `usage_count < usage_limit`,
 * evaluated by Postgres on the locked row — so the overall limit holds under
 * any concurrency. It also takes the discount's row lock until the transaction
 * ends, which serialises every redemption of that discount; the per-customer
 * count read *after* it therefore sees every earlier redemption, committed.
 * The cost is that orders using the same discount queue on that row for the
 * rest of the order transaction, so keep that transaction short: no network
 * calls inside it.
 */

export type RedemptionFailure = "unknown-discount" | "usage-limit" | "customer-limit";

export class DiscountRedemptionError extends Error {
  constructor(
    readonly discountId: string,
    readonly reason: RedemptionFailure,
  ) {
    super(`Discount ${discountId} cannot be redeemed: ${reason}`);
    this.name = "DiscountRedemptionError";
  }
}

type Db = Pick<Prisma.TransactionClient, "discount" | "discountRedemption">;

export async function redeemDiscounts(
  tx: Db,
  order: {
    storeId: string;
    orderId: string;
    email: string;
    userId: string | null;
    discountIds: readonly string[];
  },
): Promise<void> {
  const email = order.email.trim().toLowerCase();

  // A fixed lock order, so two orders sharing two discounts cannot deadlock.
  for (const discountId of [...new Set(order.discountIds)].sort()) {
    const { count } = await tx.discount.updateMany({
      where: {
        id: discountId,
        storeId: order.storeId,
        OR: [{ usageLimit: null }, { usageCount: { lt: tx.discount.fields.usageLimit } }],
      },
      data: { usageCount: { increment: 1 } },
    });

    if (count === 0) {
      const exists = await tx.discount.count({
        where: { id: discountId, storeId: order.storeId },
      });
      throw new DiscountRedemptionError(discountId, exists ? "usage-limit" : "unknown-discount");
    }

    const discount = await tx.discount.findUniqueOrThrow({
      where: { id: discountId },
      select: { perCustomerLimit: true },
    });

    if (discount.perCustomerLimit !== null) {
      // Exact match: redemption emails are lower-case by constraint. Not
      // `mode: "insensitive"`, whose ILIKE would read `_` as a wildcard.
      const used = await tx.discountRedemption.count({
        where: {
          discountId,
          OR: [{ email }, ...(order.userId ? [{ userId: order.userId }] : [])],
        },
      });
      if (used >= discount.perCustomerLimit) {
        throw new DiscountRedemptionError(discountId, "customer-limit");
      }
    }

    await tx.discountRedemption.create({
      data: { discountId, orderId: order.orderId, userId: order.userId, email },
    });
  }
}

/**
 * Gives an order's uses back — for an order cancelled before it was paid, so a
 * checkout abandoned at the payment step does not burn a one-per-customer code.
 * Idempotent: a second call finds no redemptions and changes nothing.
 */
export async function releaseDiscounts(
  tx: Db,
  order: { storeId: string; orderId: string },
): Promise<void> {
  const redemptions = await tx.discountRedemption.findMany({
    where: { orderId: order.orderId, discount: { storeId: order.storeId } },
    select: { id: true, discountId: true },
    orderBy: { discountId: "asc" },
  });

  for (const redemption of redemptions) {
    // Scoped by id so a concurrent release of the same order deletes it once
    // and only that call gives the use back.
    const { count } = await tx.discountRedemption.deleteMany({
      where: { id: redemption.id },
    });
    if (count === 0) continue;

    await tx.discount.updateMany({
      where: { id: redemption.discountId, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
  }
}
