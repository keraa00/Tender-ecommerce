/**
 * "Download my data": everything Tender keeps about a person as a person — the
 * account, the stores they belong to, and the orders they placed while signed
 * in. A store's own catalogue and sales are the business's records, already in
 * its admin, and are not part of it.
 *
 * Pure: the route handler gathers the rows, this shapes them, so the shape can
 * be tested without a database. Money stays in integer cents beside its
 * currency, exactly as stored, so nothing is lost to formatting.
 */

export const ACCOUNT_EXPORT_VERSION = 1;

type Address = unknown;

export type AccountExportInput = {
  user: { id: string; email: string; name: string | null; createdAt: Date };
  auth: {
    emailConfirmedAt?: string | null;
    lastSignInAt?: string | null;
  } | null;
  memberships: {
    role: string;
    createdAt: Date;
    store: { name: string; slug: string };
  }[];
  orders: {
    orderNumber: number;
    status: string;
    paymentMethod: string;
    currency: string;
    email: string;
    subtotalCents: number;
    discountCents: number;
    shippingCents: number;
    paymentFeeCents: number;
    totalCents: number;
    shippingAddress: Address;
    billingAddress: Address;
    shippingRateName: string | null;
    note: string | null;
    marketingConsent: boolean;
    createdAt: Date;
    paidAt: Date | null;
    fulfilledAt: Date | null;
    cancelledAt: Date | null;
    store: { name: string; slug: string };
    lines: {
      titleSnapshot: string;
      variantTitleSnapshot: string;
      skuSnapshot: string | null;
      unitPriceCents: number;
      quantity: number;
      discountCents: number;
    }[];
  }[];
  generatedAt: Date;
};

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function buildAccountExport(input: AccountExportInput) {
  return {
    format: "tender-account-export",
    version: ACCOUNT_EXPORT_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    account: {
      id: input.user.id,
      email: input.user.email,
      name: input.user.name,
      createdAt: input.user.createdAt.toISOString(),
      emailConfirmedAt: input.auth?.emailConfirmedAt ?? null,
      lastSignInAt: input.auth?.lastSignInAt ?? null,
    },
    storeMemberships: input.memberships.map((membership) => ({
      store: membership.store.name,
      storeSlug: membership.store.slug,
      role: membership.role,
      since: membership.createdAt.toISOString(),
    })),
    ordersPlaced: input.orders.map((order) => ({
      store: order.store.name,
      storeSlug: order.store.slug,
      orderNumber: order.orderNumber,
      placedAt: order.createdAt.toISOString(),
      status: order.status,
      paymentMethod: order.paymentMethod,
      email: order.email,
      currency: order.currency,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      shippingCents: order.shippingCents,
      paymentFeeCents: order.paymentFeeCents,
      totalCents: order.totalCents,
      shippingMethod: order.shippingRateName,
      shippingAddress: order.shippingAddress ?? null,
      billingAddress: order.billingAddress ?? null,
      note: order.note,
      marketingConsent: order.marketingConsent,
      paidAt: iso(order.paidAt),
      fulfilledAt: iso(order.fulfilledAt),
      cancelledAt: iso(order.cancelledAt),
      lines: order.lines.map((line) => ({
        title: line.titleSnapshot,
        variant: line.variantTitleSnapshot,
        sku: line.skuSnapshot,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        discountCents: line.discountCents,
      })),
    })),
  };
}

/** `tender-account-2026-11-11.json`, dated in UTC like every admin date. */
export function accountExportFilename(generatedAt: Date): string {
  return `tender-account-${generatedAt.toISOString().slice(0, 10)}.json`;
}
