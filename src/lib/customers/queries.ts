import "server-only";

import { rootDb } from "@/lib/db/root";
import { SETTLED_ORDER_STATUSES } from "@/lib/orders/queries";

/**
 * There is no `customers` table, and deliberately so. A customer of a store is
 * whoever has paid it, and checkout is open to guests — so the identity that
 * spans a buyer's orders is the email on them, not a user row. Rolling the
 * orders up on read keeps one source of truth; a separate table would need a
 * write path that guest checkout has no natural place to call.
 */

export type StoreCustomer = {
  email: string;
  /** From the linked account, when the buyer had one. Guests have none. */
  name: string | null;
  hasAccount: boolean;
  orders: number;
  spentCents: number;
  lastOrderAt: Date;
};

export async function listStoreCustomers(
  storeId: string,
  limit = 50,
): Promise<StoreCustomer[]> {
  const rows = await rootDb.order.groupBy({
    by: ["email"],
    where: { storeId, status: { in: [...SETTLED_ORDER_STATUSES] } },
    _count: { _all: true },
    _sum: { totalCents: true },
    _max: { createdAt: true },
    orderBy: { _sum: { totalCents: "desc" } },
    take: limit,
  });

  if (rows.length === 0) return [];

  // One lookup for the whole page rather than one per row. An email that
  // matches no account is a guest, which is a normal outcome, not a miss.
  const accounts = await rootDb.user.findMany({
    where: { email: { in: rows.map((row) => row.email) } },
    select: { email: true, name: true },
  });
  const byEmail = new Map(accounts.map((user) => [user.email, user.name]));

  return rows.map((row) => ({
    email: row.email,
    name: byEmail.get(row.email) ?? null,
    hasAccount: byEmail.has(row.email),
    orders: row._count._all,
    spentCents: row._sum.totalCents ?? 0,
    // `_max.createdAt` cannot actually be null — the group exists because rows
    // do — but the generated type allows it, and a fabricated date would be
    // worse than the epoch showing up in a bug report.
    lastOrderAt: row._max.createdAt ?? new Date(0),
  }));
}
