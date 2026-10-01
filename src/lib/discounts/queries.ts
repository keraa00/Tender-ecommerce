import "server-only";

import { rootDb } from "@/lib/db/root";
import { Prisma, type DiscountTargetRole } from "@/lib/db/types";
import { SETTLED_ORDER_STATUSES } from "@/lib/orders/queries";
import type { DiscountRule, DiscountScope } from "./engine";
import { normalizeDiscountCode } from "./form";
import type { DiscountSummary } from "./format";
import type { CustomerProfile } from "./segments";

/**
 * Discount reads. Like every other query module, each function takes `storeId`
 * first and filters by it — a discount id or code alone never identifies a
 * row, and two stores may both own `WELCOME10`.
 */

type Links = {
  products: { productId: string; role: DiscountTargetRole }[];
  collections: { collectionId: string; role: DiscountTargetRole }[];
};

const linksSelect = {
  products: { select: { productId: true, role: true } },
  collections: { select: { collectionId: true, role: true } },
} as const;

function idsFor(links: Links, role: DiscountTargetRole) {
  return {
    productIds: links.products.filter((link) => link.role === role).map((link) => link.productId),
    collectionIds: links.collections
      .filter((link) => link.role === role)
      .map((link) => link.collectionId),
  };
}

// ---------------------------------------------------------------------------
// Seller admin
// ---------------------------------------------------------------------------

/** Every discount, with what the list needs to summarise each one. */
export async function listStoreDiscounts(storeId: string) {
  return rootDb.discount.findMany({
    where: { storeId },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      ...linksSelect,
      _count: { select: { customers: true } },
    },
  });
}

export type StoreDiscount = Awaited<ReturnType<typeof listStoreDiscounts>>[number];

/** One discount for editing, with its targets and customer list. */
export async function getStoreDiscount(storeId: string, discountId: string) {
  return rootDb.discount.findFirst({
    where: { id: discountId, storeId },
    include: {
      ...linksSelect,
      customers: { select: { email: true }, orderBy: { email: "asc" } },
    },
  });
}

export type EditableDiscount = NonNullable<Awaited<ReturnType<typeof getStoreDiscount>>>;

/** The row plus link counts, in the shape `describeDiscount` reads. */
export function toDiscountSummary(
  discount: StoreDiscount | EditableDiscount,
): DiscountSummary {
  const discounted = idsFor(discount, "DISCOUNTED");
  const qualifying = idsFor(discount, "QUALIFYING");
  const customerCount =
    "customers" in discount ? discount.customers.length : discount._count.customers;

  return {
    type: discount.type,
    value: discount.value,
    appliesTo: discount.appliesTo,
    productCount: discounted.productIds.length,
    collectionCount: discounted.collectionIds.length,
    buysFrom: discount.buysFrom,
    buyProductCount: qualifying.productIds.length,
    buyCollectionCount: qualifying.collectionIds.length,
    buyQuantity: discount.buyQuantity,
    getQuantity: discount.getQuantity,
    maxUsesPerOrder: discount.maxUsesPerOrder,
    minSubtotalCents: discount.minSubtotalCents,
    minQuantity: discount.minQuantity,
    eligibility: discount.eligibility,
    segments: discount.segments,
    customerCount,
    usageLimit: discount.usageLimit,
    perCustomerLimit: discount.perCustomerLimit,
    combinable: discount.combinable,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
  };
}

/** The targets split by side, for pre-filling the form. */
export function discountTargets(discount: EditableDiscount) {
  const discounted = idsFor(discount, "DISCOUNTED");
  const qualifying = idsFor(discount, "QUALIFYING");
  return {
    productIds: discounted.productIds,
    collectionIds: discounted.collectionIds,
    buyProductIds: qualifying.productIds,
    buyCollectionIds: qualifying.collectionIds,
  };
}

/** Paid orders that used the discount, and what it took off them. */
export async function discountPerformance(storeId: string, discountId: string) {
  const [redemptions, orders] = await Promise.all([
    rootDb.discountRedemption.count({
      where: { discountId, discount: { storeId } },
    }),
    rootDb.order.aggregate({
      where: {
        storeId,
        status: { in: [...SETTLED_ORDER_STATUSES] },
        redemptions: { some: { discountId } },
      },
      _count: { _all: true },
      _sum: { discountCents: true, totalCents: true },
    }),
  ]);

  return {
    redemptions,
    paidOrders: orders._count._all,
    discountCents: orders._sum.discountCents ?? 0,
    salesCents: orders._sum.totalCents ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

const ruleInclude = {
  ...linksSelect,
  customers: { select: { email: true } },
} as const;

type RuleRow = Prisma.DiscountGetPayload<{ include: typeof ruleInclude }>;

function scope(
  appliesTo: DiscountScope["appliesTo"],
  ids: { productIds: string[]; collectionIds: string[] },
): DiscountScope {
  return { appliesTo, ...ids };
}

export function toDiscountRule(row: RuleRow): DiscountRule {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    type: row.type,
    value: row.value,
    discounted: scope(row.appliesTo, idsFor(row, "DISCOUNTED")),
    qualifying: row.buysFrom ? scope(row.buysFrom, idsFor(row, "QUALIFYING")) : null,
    buyQuantity: row.buyQuantity,
    getQuantity: row.getQuantity,
    maxUsesPerOrder: row.maxUsesPerOrder,
    minSubtotalCents: row.minSubtotalCents,
    minQuantity: row.minQuantity,
    eligibility: row.eligibility,
    segments: row.segments,
    customerEmails: row.customers.map((customer) => customer.email),
    usageLimit: row.usageLimit,
    usageCount: row.usageCount,
    perCustomerLimit: row.perCustomerLimit,
    combinable: row.combinable,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    active: row.active,
  };
}

/**
 * Everything on offer for one order: the automatic discounts live right now,
 * plus the codes the buyer entered. Codes are loaded whatever their state so
 * the engine can say *why* one does not apply — "expired" helps a buyer more
 * than "not found". A code that matches nothing is simply absent; the caller
 * compares against what was entered.
 */
export async function loadDiscountRules(
  storeId: string,
  enteredCodes: readonly string[],
  now: Date,
): Promise<DiscountRule[]> {
  const codes = [...new Set(enteredCodes.map(normalizeDiscountCode).filter(Boolean))];

  const rows = await rootDb.discount.findMany({
    where: {
      storeId,
      OR: [
        ...(codes.length > 0 ? [{ code: { in: codes } }] : []),
        {
          code: null,
          active: true,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
      ],
    },
    include: ruleInclude,
  });

  return rows.map(toDiscountRule);
}

/**
 * What the engine needs to know about the buyer: their standing with this
 * store, for segments, and how often they have used each discount, for the
 * per-customer limit. Matched on email case-insensitively — the identity that
 * spans guest and signed-in orders — and on the account as well, so a signed-in
 * buyer cannot reset their count by checking out under another address.
 */
export async function loadCustomerProfile(
  storeId: string,
  buyer: { email: string | null; userId: string | null },
): Promise<{ profile: CustomerProfile; redemptions: Map<string, number> }> {
  const email = buyer.email?.trim().toLowerCase() || null;
  const profile: CustomerProfile = {
    email,
    hasAccount: buyer.userId !== null,
    settledOrders: 0,
    lastOrderAt: null,
  };
  if (!email && !buyer.userId) return { profile, redemptions: new Map() };

  // Raw SQL for the orders, because order emails keep the case they were typed
  // in and Prisma's case-insensitive `equals` is an unescaped ILIKE — an `_` in
  // an address would match any character. `lower(email) = $1` is exact. The
  // epoch read keeps the timestamp in UTC whatever the driver's zone.
  const [history, used] = await Promise.all([
    rootDb.$queryRaw<{ orders: number; last_order_ms: number | null }[]>`
      SELECT count(*)::int AS orders,
             (extract(epoch FROM max("created_at")) * 1000)::float8 AS last_order_ms
      FROM "orders"
      WHERE "store_id" = ${storeId}::uuid
        AND "status"::text IN (${Prisma.join([...SETTLED_ORDER_STATUSES])})
        AND (lower("email") = ${email} OR "user_id" = ${buyer.userId}::uuid)
    `,
    // Redemption emails are lower-case by constraint, so equality is exact.
    rootDb.discountRedemption.groupBy({
      by: ["discountId"],
      where: {
        discount: { storeId },
        OR: [
          ...(email ? [{ email }] : []),
          ...(buyer.userId ? [{ userId: buyer.userId }] : []),
        ],
      },
      _count: { _all: true },
    }),
  ]);

  const row = history[0];
  profile.settledOrders = row?.orders ?? 0;
  profile.lastOrderAt = row?.last_order_ms != null ? new Date(row.last_order_ms) : null;

  return {
    profile,
    redemptions: new Map(used.map((row) => [row.discountId, row._count._all])),
  };
}
