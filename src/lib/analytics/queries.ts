import "server-only";

import { rootDb } from "@/lib/db/root";
import { SETTLED_ORDER_STATUSES } from "@/lib/orders/queries";
import { foldTopProducts, type TopProduct } from "./top-products";

export type { TopProduct } from "./top-products";

/**
 * Store analytics, computed from settled orders only.
 *
 * Everything here reads from the snapshots on `orders` and `order_lines`
 * rather than joining back to the catalogue: an order is a historical record,
 * so a product that was renamed or deleted must not change what last month
 * earned.
 */

export type StoreTotals = {
  orders: number;
  /** What buyers paid, after discounts. */
  grossCents: number;
  /** Platform commission taken out of that. */
  feeCents: number;
  /** What settles to the seller's own Stripe account. */
  netCents: number;
  /** Average order value, or null when there are no orders to average. */
  averageOrderCents: number | null;
};

function settledWhere(storeId: string, since?: Date) {
  return {
    storeId,
    status: { in: [...SETTLED_ORDER_STATUSES] },
    ...(since ? { paidAt: { gte: since } } : {}),
  };
}

export async function getStoreTotals(
  storeId: string,
  since?: Date,
): Promise<StoreTotals> {
  const result = await rootDb.order.aggregate({
    where: settledWhere(storeId, since),
    _count: { _all: true },
    _sum: {
      totalCents: true,
      platformFeeCents: true,
      sellerNetCents: true,
    },
  });

  const orders = result._count._all;
  const grossCents = result._sum.totalCents ?? 0;

  return {
    orders,
    grossCents,
    feeCents: result._sum.platformFeeCents ?? 0,
    netCents: result._sum.sellerNetCents ?? 0,
    averageOrderCents: orders === 0 ? null : Math.round(grossCents / orders),
  };
}

/**
 * Best sellers in the window.
 *
 * Grouping by `(title, unit price)` rather than by title alone is what makes
 * the revenue column exact: Prisma can sum a column but not a product of two,
 * and a line's revenue is `quantity × unitPriceCents` less its discount. One
 * group per distinct price a title has ever sold at is a small, bounded
 * number, and folding them together afterwards costs one pass.
 */
export async function listTopProducts(
  storeId: string,
  since?: Date,
  limit = 5,
): Promise<TopProduct[]> {
  const rows = await rootDb.orderLine.groupBy({
    by: ["titleSnapshot", "unitPriceCents"],
    where: { order: settledWhere(storeId, since) },
    _sum: { quantity: true, discountCents: true },
  });

  return foldTopProducts(
    rows.map((row) => ({
      titleSnapshot: row.titleSnapshot,
      unitPriceCents: row.unitPriceCents,
      quantity: row._sum.quantity ?? 0,
      discountCents: row._sum.discountCents ?? 0,
    })),
    limit,
  );
}
