import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";

import { AdminPage, Arrow } from "@/components/admin/page-shell";
import { CodOrderActions } from "@/components/orders/cod-order-actions";
import { FulfillOrderButton } from "@/components/orders/fulfill-order-button";
import { Badge, OrderStatusBadge } from "@/components/ui/badge";
import type { PostalAddress } from "@/lib/address/types";
import { formatAddressLines, readAddress } from "@/lib/address/validate";
import { storeAdminPath } from "@/lib/admin/links";
import { customerPathSegment } from "@/lib/customers/filters";
import { formatDate } from "@/lib/dates";
import { PaymentMethod } from "@/lib/db/types";
import { format, plural } from "@/lib/i18n/format";
import { formatRich } from "@/lib/i18n/rich";
import { getAdminI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import {
  cancelCodOrderAction,
  fulfillOrderAction,
  markCodOrderPaidAction,
} from "@/lib/orders/actions";
import { getStoreOrder } from "@/lib/orders/queries";
import { formatEstimate } from "@/lib/shipping/format";
import { getStoreContext } from "@/lib/stores/context";
import { isStripeTestMode } from "@/lib/stripe/server";

// Shared by the metadata and the page, which render in the same request.
const loadOrder = cache(async (storeSlug: string, orderId: string) => {
  const { store } = await getStoreContext(storeSlug);
  // `storeId` is part of the lookup, so another store's order id 404s.
  return { store, order: await getStoreOrder(store.id, orderId) };
});

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/orders/[orderId]">,
): Promise<Metadata> {
  const { storeSlug, orderId } = await props.params;
  const [{ store, order }, { t }] = await Promise.all([
    loadOrder(storeSlug, orderId),
    getAdminI18n(),
  ]);
  return {
    title: order
      ? `${format(t.orders.detail.title, { number: order.orderNumber })} · ${store.name}`
      : t.orders.detail.fallbackTitle,
  };
}

type DiscountSnapshot = {
  discountId: string;
  title: string;
  code: string | null;
  amountCents: number;
  shippingCents: number;
};

/** The order's discount snapshot, read defensively: it is JSON, not a table. */
function discountSnapshot(value: unknown): DiscountSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): DiscountSnapshot[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.title !== "string" || typeof record.amountCents !== "number") return [];
    return [
      {
        discountId: typeof record.discountId === "string" ? record.discountId : record.title,
        title: record.title,
        code: typeof record.code === "string" ? record.code : null,
        amountCents: record.amountCents,
        shippingCents: typeof record.shippingCents === "number" ? record.shippingCents : 0,
      },
    ];
  });
}

/**
 * One order, as it was placed. Everything here reads the order's own
 * snapshots — lines, discounts, addresses, the rate — so editing a product, a
 * discount or a shipping zone afterwards changes nothing on this page.
 *
 * A paid order is marked fulfilled here once it is sent. Payments are direct
 * charges on the seller's own Stripe account, so refunds and disputes are
 * handled in their Stripe Dashboard, which this page links to; the webhooks
 * bring the outcome back, and the order shows it. A cash-on-delivery order is
 * the exception: nothing tells Tender the cash came in, so the seller says so
 * here — or cancels it, and its stock goes back.
 */
export default async function OrderPage(
  props: PageProps<"/dashboard/[storeSlug]/orders/[orderId]">,
) {
  const { storeSlug, orderId } = await props.params;
  const [{ store, order }, { t: messages, locale, intl }] = await Promise.all([
    loadOrder(storeSlug, orderId),
    getAdminI18n(),
  ]);
  if (!order) notFound();
  const t = messages.orders.detail;

  const money = (cents: number) => formatMoney(cents, order.currency, intl);
  const discounts = discountSnapshot(order.appliedDiscounts);
  const shippingAddress = readAddress(order.shippingAddress);
  const billingAddress = readAddress(order.billingAddress);
  const shippingDiscount = discounts.reduce((sum, entry) => sum + entry.shippingCents, 0);
  const estimate = formatEstimate(
    { minDeliveryDays: order.shippingMinDays, maxDeliveryDays: order.shippingMaxDays },
    { locale, intl, t: messages.shippingFormat },
  );
  const itemCount = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const paymentUrl = order.stripePaymentIntentId
    ? `https://dashboard.stripe.com/${isStripeTestMode() ? "test/" : ""}payments/${order.stripePaymentIntentId}`
    : null;
  const paidAfterCancel = order.issues.includes("PAID_AFTER_CANCEL");
  const cashOnDelivery = order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY;

  return (
    <AdminPage
      title={format(t.title, { number: order.orderNumber })}
      back={{ href: storeAdminPath(store.slug, "orders"), label: messages.orders.title }}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{format(t.placed, { date: formatDate(order.createdAt, locale) })}</span>
          <OrderStatusBadge status={order.status} paymentMethod={order.paymentMethod} />
        </span>
      }
    >
      {order.issues.length > 0 ? (
        <div className="mb-6 space-y-3">
          {order.issues.map((issue) => (
            <div
              key={issue}
              role="alert"
              className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-pretty"
            >
              <p className="font-medium text-warning">{t.issues[issue].title}</p>
              <p className="mt-1">
                {t.issues[issue].body}{" "}
                {paymentUrl ? (
                  <a
                    href={paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-4"
                  >
                    {t.openInStripe} <Arrow>↗</Arrow>
                  </a>
                ) : null}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Panel title={plural(locale, itemCount, messages.orders.items)}>
            <ul className="divide-y divide-border">
              {order.lines.map((line) => {
                const lineTotal = line.unitPriceCents * line.quantity;
                return (
                  <li key={line.id} className="flex items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-surface-subtle">
                      {line.imageUrlSnapshot ? (
                        <Image src={line.imageUrlSnapshot} alt="" fill sizes="48px" className="object-cover" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">{line.titleSnapshot}</span>
                      <span className="block text-muted">
                        {[
                          line.variantTitleSnapshot.toLowerCase() === "default" ? null : line.variantTitleSnapshot,
                          line.skuSnapshot,
                        ]
                          .filter(Boolean)
                          .join(" · ") || " "}
                      </span>
                    </span>
                    <span className="shrink-0 text-end tabular">
                      <span className="block text-muted">
                        {money(line.unitPriceCents)} × {new Intl.NumberFormat(intl).format(line.quantity)}
                      </span>
                      {line.discountCents > 0 ? (
                        <>
                          <del className="block text-xs text-muted">{money(lineTotal)}</del>
                          <span className="block">{money(lineTotal - line.discountCents)}</span>
                        </>
                      ) : (
                        <span className="block">{money(lineTotal)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title={t.payment}>
            <dl className="space-y-2 text-sm">
              <Sum label={t.subtotal} value={money(order.subtotalCents)} />
              {discounts.map((entry) => (
                <Sum
                  key={entry.discountId}
                  label={
                    <span className="flex flex-wrap items-center gap-2">
                      {entry.title}
                      {entry.code ? (
                        <code className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs text-muted ring-1 ring-border ring-inset">
                          {entry.code}
                        </code>
                      ) : null}
                    </span>
                  }
                  value={
                    entry.amountCents + entry.shippingCents > 0
                      ? money(-(entry.amountCents + entry.shippingCents))
                      : t.freeShipping
                  }
                  valueClassName="text-success"
                />
              ))}
              {shippingAddress ? (
                <Sum
                  label={
                    order.shippingRateName
                      ? format(t.shippingWithRate, { rate: order.shippingRateName })
                      : t.shipping
                  }
                  value={order.shippingCents === 0 ? t.free : money(order.shippingCents)}
                />
              ) : null}
              {order.paymentFeeCents > 0 ? (
                <Sum label={t.codFee} value={money(order.paymentFeeCents)} />
              ) : null}
              <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
                <dt className="font-medium">{t.total}</dt>
                <dd className="text-lg font-semibold tabular">{money(order.totalCents)}</dd>
              </div>
              <Sum
                label={cashOnDelivery ? t.commissionBilledSeparately : t.commission}
                value={money(-order.platformFeeCents)}
                muted
              />
              <Sum label={t.earnings} value={money(order.sellerNetCents)} muted />
              {order.refundedCents > 0 ? (
                <Sum
                  label={
                    order.refundedAt
                      ? format(t.refundedOn, { date: formatDate(order.refundedAt, locale) })
                      : t.refunded
                  }
                  value={money(-order.refundedCents)}
                  valueClassName="text-warning"
                />
              ) : null}
            </dl>
            <p className="mt-3 text-xs text-muted">
              {cashOnDelivery ? t.paidByCod : t.paidByStripe}
            </p>
            {shippingDiscount > 0 ? (
              <p className="mt-3 text-xs text-muted">
                {format(t.shippingDiscountNote, { amount: money(shippingDiscount) })}
              </p>
            ) : null}
            {order.status === "PENDING" && cashOnDelivery ? (
              <div className="mt-3 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-muted text-pretty">
                <p>{format(t.codPending, { total: money(order.totalCents) })}</p>
                <CodOrderActions
                  t={messages.orders.actions}
                  total={money(order.totalCents)}
                  markPaid={markCodOrderPaidAction.bind(null, store.slug, order.id)}
                  cancel={cancelCodOrderAction.bind(null, store.slug, order.id)}
                />
              </div>
            ) : order.status === "PENDING" ? (
              <p className="mt-3 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-muted text-pretty">
                {t.awaitingPayment}
              </p>
            ) : order.status === "CANCELLED" && cashOnDelivery && !order.paidAt ? (
              <p className="mt-3 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-muted text-pretty">
                {t.cancelledCod}
              </p>
            ) : order.status === "CANCELLED" && !order.paidAt && !paidAfterCancel ? (
              <p className="mt-3 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-muted text-pretty">
                {t.cancelledUnpaid}
              </p>
            ) : null}
            {order.stripePaymentIntentId && paymentUrl ? (
              <p className="mt-3 text-xs text-muted">
                {formatRich(t.stripePayment, {
                  id: (
                    <a
                      href={paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono underline-offset-4 hover:underline"
                    >
                      {order.stripePaymentIntentId}
                    </a>
                  ),
                })}
              </p>
            ) : null}
          </Panel>
        </div>

        <aside className="min-w-0 space-y-6">
          {order.status === "PAID" || order.status === "FULFILLED" ? (
            <Panel title={t.fulfilment}>
              {order.status === "FULFILLED" ? (
                <p className="text-sm text-muted">
                  {order.fulfilledAt
                    ? format(t.fulfilledOn, { date: formatDate(order.fulfilledAt, locale) })
                    : t.fulfilled}
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted text-pretty">
                    {shippingAddress ? t.notSent : t.nothingToShip}
                  </p>
                  <FulfillOrderButton
                    t={messages.orders.actions}
                    fulfill={fulfillOrderAction.bind(null, store.slug, order.id)}
                  />
                </div>
              )}
            </Panel>
          ) : null}

          <Panel title={t.customer}>
            <Link
              href={storeAdminPath(store.slug, `customers/${customerPathSegment(order.email)}`)}
              className="block break-all text-sm underline-offset-4 hover:underline"
            >
              {order.email}
            </Link>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge>{order.user ? t.signedIn : t.guest}</Badge>
              {order.marketingConsent ? <Badge tone="success">{t.acceptsMarketing}</Badge> : null}
            </div>
            {shippingAddress?.phone ?? billingAddress?.phone ? (
              <p className="mt-2 text-sm" dir="ltr">
                {shippingAddress?.phone ?? billingAddress?.phone}
              </p>
            ) : null}
          </Panel>

          {shippingAddress ? (
            <Panel title={t.shippingAddress}>
              <AddressBlock address={shippingAddress} locale={intl} />
              {order.shippingRateName ? (
                <div className="mt-3 border-t border-border pt-3 text-sm">
                  <p className="font-medium">{order.shippingRateName}</p>
                  <p className="text-muted">
                    {[order.shippingZoneName ? format(t.zone, { zone: order.shippingZoneName }) : null, estimate]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ) : null}
            </Panel>
          ) : (
            <Panel title={t.shipping}>
              <p className="text-sm text-muted">{t.digitalOnly}</p>
            </Panel>
          )}

          <Panel title={t.billingAddress}>
            {billingAddress ? (
              <AddressBlock address={billingAddress} locale={intl} />
            ) : (
              <p className="text-sm text-muted">{t.notRecorded}</p>
            )}
          </Panel>

          {order.note ? (
            <Panel title={t.note}>
              <p className="whitespace-pre-line break-words text-sm">{order.note}</p>
            </Panel>
          ) : null}
        </aside>
      </div>
    </AdminPage>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Sum({
  label,
  value,
  valueClassName,
  muted = false,
}: {
  label: ReactNode;
  value: string;
  valueClassName?: string;
  muted?: boolean;
}) {
  return (
    <div className={muted ? "flex items-baseline justify-between gap-4 text-muted" : "flex items-baseline justify-between gap-4"}>
      <dt className={muted ? "min-w-0" : "min-w-0 text-muted"}>{label}</dt>
      <dd className={valueClassName ? `shrink-0 tabular ${valueClassName}` : "shrink-0 tabular"}>{value}</dd>
    </div>
  );
}

function AddressBlock({ address, locale }: { address: PostalAddress; locale: string }) {
  return (
    <address className="text-sm not-italic">
      {formatAddressLines(address, locale).map((line, index) => (
        <span key={index} className="block break-words">
          {line}
        </span>
      ))}
    </address>
  );
}
