import "server-only";

import type { PostalAddress } from "@/lib/address/types";
import { readAddress } from "@/lib/address/validate";
import { rootDb } from "@/lib/db/root";
import { Prisma, type OrderStatus, type PaymentMethod } from "@/lib/db/types";
import { SETTLED_ORDER_STATUSES } from "@/lib/orders/queries";

/**
 * There is no `customers` table, and deliberately so. A customer of a store is
 * whoever has paid it, and checkout is open to guests — so the identity that
 * spans a buyer's orders is the email on them, not a user row. Rolling the
 * orders up on read keeps one source of truth; a separate table would need a
 * write path that guest checkout has no natural place to call.
 *
 * Like every other query module here, each function takes `storeId` first and
 * filters by it. The same address may well have bought from other stores too.
 */

export type StoreCustomer = {
  /** Lower-cased — the key a customer is grouped, linked and looked up by. */
  email: string;
  /** As written on their latest order's address, shipping or billing. */
  name: string | null;
  /** Signed in for at least one of their orders in this store. */
  hasAccount: boolean;
  /** Settled orders, like every figure here. */
  orders: number;
  spentCents: number;
  firstOrderAt: Date;
  lastOrderAt: Date;
};

type CustomerRow = {
  email: string;
  name: string | null;
  has_account: boolean;
  orders: number;
  spent_cents: bigint | number;
  first_order_ms: number;
  last_order_ms: number;
};

/**
 * The buyer's name on one order, from its shipping address or else its
 * billing one: "First Last", or the single `name` of a legacy address.
 */
const ORDER_ADDRESS = Prisma.sql`coalesce(o."shipping_address", o."billing_address")`;
const ORDER_NAME = Prisma.sql`coalesce(
  nullif(trim(concat_ws(' ', ${ORDER_ADDRESS}->>'firstName', ${ORDER_ADDRESS}->>'lastName')), ''),
  nullif(trim(${ORDER_ADDRESS}->>'name'), '')
)`;

/**
 * The one definition of "a customer and their totals", which the list, the
 * discount form's picker and the detail page all read through — so a row and
 * the page it links to cannot disagree about what someone has spent.
 *
 * Raw SQL because order emails keep the case they were typed in, and grouping
 * on the column as stored would split `Ann@x.com` and `ann@x.com` into two
 * customers. Prisma's `groupBy` cannot group on an expression, and its
 * case-insensitive `equals` is an unescaped ILIKE that reads `_` as a wildcard;
 * `lower(email) = $1` is exact. The epoch reads keep timestamps in UTC whatever
 * the driver's zone, as in `loadCustomerProfile`.
 *
 * Name and account status come from this store's own orders, never from the
 * platform's `users` table: joining that by email would tell any seller
 * whether an address they typed into their own checkout has a Tender account,
 * and whose name is on it. The name is the one on the customer's latest order;
 * "has an account" means they were signed in for at least one order here.
 */
async function rollUpCustomers(
  storeId: string,
  options: { email?: string; limit?: number } = {},
): Promise<StoreCustomer[]> {
  const rows = await rootDb.$queryRaw<CustomerRow[]>`
    SELECT c.email,
           c.name,
           c.has_account,
           c.orders,
           c.spent_cents,
           c.first_order_ms,
           c.last_order_ms
    FROM (
      SELECT lower(o."email") AS email,
             (array_agg(${ORDER_NAME} ORDER BY o."created_at" DESC)
               FILTER (WHERE ${ORDER_NAME} IS NOT NULL))[1] AS name,
             bool_or(o."user_id" IS NOT NULL) AS has_account,
             count(*)::int AS orders,
             sum(o."total_cents")::bigint AS spent_cents,
             (extract(epoch FROM min(o."created_at")) * 1000)::float8 AS first_order_ms,
             (extract(epoch FROM max(o."created_at")) * 1000)::float8 AS last_order_ms
      FROM "orders" o
      WHERE o."store_id" = ${storeId}::uuid
        AND o."status"::text IN (${Prisma.join([...SETTLED_ORDER_STATUSES])})
        ${options.email === undefined ? Prisma.empty : Prisma.sql`AND lower(o."email") = ${options.email}`}
      GROUP BY lower(o."email")
    ) c
    ORDER BY c.spent_cents DESC, c.last_order_ms DESC, c.email
    ${options.limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${options.limit}`}
  `;

  return rows.map((row) => ({
    email: row.email,
    name: row.name,
    hasAccount: row.has_account,
    orders: row.orders,
    spentCents: Number(row.spent_cents),
    firstOrderAt: new Date(row.first_order_ms),
    lastOrderAt: new Date(row.last_order_ms),
  }));
}

/** The top spenders, for the discount form's customer picker. */
export async function listStoreCustomers(
  storeId: string,
  limit = 50,
): Promise<StoreCustomer[]> {
  return rollUpCustomers(storeId, { limit });
}

/** Every customer of the store, highest spend first. */
export async function listAllStoreCustomers(
  storeId: string,
): Promise<StoreCustomer[]> {
  return rollUpCustomers(storeId);
}

export type CustomerOrder = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  totalCents: number;
  currency: string;
  createdAt: Date;
  itemCount: number;
  /** The rate it shipped by, as chosen; null when nothing shipped. */
  shippingRateName: string | null;
};

export type CustomerRedemption = {
  id: string;
  createdAt: Date;
  /** Null for an automatic discount, which has no code to type. */
  code: string | null;
  title: string;
  orderNumber: number;
};

export type StoreCustomerDetail = {
  customer: StoreCustomer;
  /** Every order this address placed here, in any status, newest first. */
  orders: CustomerOrder[];
  redemptions: CustomerRedemption[];
  /**
   * Where the newest order that shipped was going, with that order's number.
   * Orders of digital products alone have no address and are passed over.
   */
  lastAddress: { orderNumber: number; address: PostalAddress } | null;
};

/**
 * One customer of one store, or null when the address has never paid this
 * store — whether or not it has paid another.
 */
export async function getStoreCustomer(
  storeId: string,
  email: string,
): Promise<StoreCustomerDetail | null> {
  const key = email.trim().toLowerCase();

  const [[customer], orders, redemptions] = await Promise.all([
    rollUpCustomers(storeId, { email: key }),
    listCustomerOrders(storeId, key),
    // Redemption emails are lower-case by constraint, so equality is exact.
    rootDb.discountRedemption.findMany({
      where: { email: key, discount: { storeId } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        discount: { select: { code: true, title: true } },
        order: { select: { orderNumber: true } },
      },
    }),
  ]);

  if (!customer) return null;

  const shipped = orders
    .map((order) => ({ orderNumber: order.orderNumber, address: readAddress(order.shippingAddress) }))
    .find((entry): entry is { orderNumber: number; address: PostalAddress } => entry.address !== null);

  return {
    customer,
    orders: orders.map(({ shippingAddress: _address, _count, ...order }) => ({
      ...order,
      itemCount: _count.lines,
    })),
    redemptions: redemptions.map((redemption) => ({
      id: redemption.id,
      createdAt: redemption.createdAt,
      code: redemption.discount.code,
      title: redemption.discount.title,
      orderNumber: redemption.order.orderNumber,
    })),
    lastAddress: shipped ?? null,
  };
}

async function listCustomerOrders(storeId: string, email: string) {
  // The ids by the same exact, case-folded match the rollup uses; the rows
  // themselves through Prisma, so the shapes and dates come back typed.
  const ids = await rootDb.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "orders"
    WHERE "store_id" = ${storeId}::uuid AND lower("email") = ${email}
  `;
  if (ids.length === 0) return [];

  return rootDb.order.findMany({
    where: { storeId, id: { in: ids.map((row) => row.id) } },
    orderBy: [{ createdAt: "desc" }, { orderNumber: "desc" }],
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      totalCents: true,
      currency: true,
      createdAt: true,
      shippingAddress: true,
      shippingRateName: true,
      _count: { select: { lines: true } },
    },
  });
}
