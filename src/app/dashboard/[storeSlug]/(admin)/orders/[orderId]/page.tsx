import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";

import { AdminPage } from "@/components/admin/page-shell";
import { Badge, OrderStatusBadge } from "@/components/ui/badge";
import type { PostalAddress } from "@/lib/address/types";
import { formatAddressLines, readAddress } from "@/lib/address/validate";
import { storeAdminPath } from "@/lib/admin/links";
import { customerPathSegment } from "@/lib/customers/filters";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
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
  const { store, order } = await loadOrder(storeSlug, orderId);
  return { title: order ? `Order #${order.orderNumber} · ${store.name}` : "Order" };
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
 * No fulfilment or refund actions yet. Payments are direct charges on the
 * seller's own Stripe account, so refunds and disputes are handled in their
 * Stripe Dashboard, which this page links to.
 */
export default async function OrderPage(
  props: PageProps<"/dashboard/[storeSlug]/orders/[orderId]">,
) {
  const { storeSlug, orderId } = await props.params;
  const { store, order } = await loadOrder(storeSlug, orderId);
  if (!order) notFound();

  const money = (cents: number) => formatMoney(cents, order.currency);
  const discounts = discountSnapshot(order.appliedDiscounts);
  const shippingAddress = readAddress(order.shippingAddress);
  const billingAddress = readAddress(order.billingAddress);
  const shippingDiscount = discounts.reduce((sum, entry) => sum + entry.shippingCents, 0);
  const estimate = formatEstimate({
    minDeliveryDays: order.shippingMinDays,
    maxDeliveryDays: order.shippingMaxDays,
  });
  const itemCount = order.lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <AdminPage
      title={`Order #${order.orderNumber}`}
      back={{ href: storeAdminPath(store.slug, "orders"), label: "Orders" }}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>Placed {formatDate(order.createdAt)}</span>
          <OrderStatusBadge status={order.status} />
        </span>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Panel title={`${itemCount} ${itemCount === 1 ? "item" : "items"}`}>
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
                    <span className="shrink-0 text-right tabular">
                      <span className="block text-muted">
                        {money(line.unitPriceCents)} × {line.quantity}
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

          <Panel title="Payment">
            <dl className="space-y-2 text-sm">
              <Sum label="Subtotal" value={money(order.subtotalCents)} />
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
                      : "Free shipping"
                  }
                  valueClassName="text-success"
                />
              ))}
              {shippingAddress ? (
                <Sum
                  label={order.shippingRateName ? `Shipping · ${order.shippingRateName}` : "Shipping"}
                  value={order.shippingCents === 0 ? "Free" : money(order.shippingCents)}
                />
              ) : null}
              <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
                <dt className="font-medium">Total</dt>
                <dd className="text-lg font-semibold tabular">{money(order.totalCents)}</dd>
              </div>
              <Sum label="Tender commission" value={money(-order.platformFeeCents)} muted />
              <Sum label="Your earnings" value={money(order.sellerNetCents)} muted />
            </dl>
            {shippingDiscount > 0 ? (
              <p className="mt-3 text-xs text-muted">
                Shipping is shown at the rate&apos;s price; the free-shipping discount above takes{" "}
                {money(shippingDiscount)} off it.
              </p>
            ) : null}
            {order.status === "PENDING" ? (
              <p className="mt-3 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-muted text-pretty">
                Awaiting payment. The buyer reached the payment step but the payment hasn&apos;t
                gone through yet. Don&apos;t ship it: it turns Paid by itself once Stripe confirms
                the money.
              </p>
            ) : order.status === "CANCELLED" && !order.paidAt ? (
              <p className="mt-3 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-muted text-pretty">
                Cancelled before payment — the buyer started again or the payment was abandoned.
                Nothing was charged, and any discount uses were given back.
              </p>
            ) : null}
            {order.stripePaymentIntentId ? (
              <p className="mt-3 text-xs text-muted">
                Stripe payment{" "}
                <a
                  href={`https://dashboard.stripe.com/${isStripeTestMode() ? "test/" : ""}payments/${order.stripePaymentIntentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline-offset-4 hover:underline"
                >
                  {order.stripePaymentIntentId}
                </a>{" "}
                — refunds and disputes are handled in your Stripe Dashboard.
              </p>
            ) : null}
          </Panel>
        </div>

        <aside className="min-w-0 space-y-6">
          <Panel title="Customer">
            <Link
              href={storeAdminPath(store.slug, `customers/${customerPathSegment(order.email)}`)}
              className="block break-all text-sm underline-offset-4 hover:underline"
            >
              {order.email}
            </Link>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge>{order.user ? "Signed in" : "Guest"}</Badge>
              {order.marketingConsent ? <Badge tone="success">Accepts marketing</Badge> : null}
            </div>
            {shippingAddress?.phone ?? billingAddress?.phone ? (
              <p className="mt-2 text-sm">{shippingAddress?.phone ?? billingAddress?.phone}</p>
            ) : null}
          </Panel>

          {shippingAddress ? (
            <Panel title="Shipping address">
              <AddressBlock address={shippingAddress} />
              {order.shippingRateName ? (
                <div className="mt-3 border-t border-border pt-3 text-sm">
                  <p className="font-medium">{order.shippingRateName}</p>
                  <p className="text-muted">
                    {[order.shippingZoneName ? `Zone: ${order.shippingZoneName}` : null, estimate]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ) : null}
            </Panel>
          ) : (
            <Panel title="Shipping">
              <p className="text-sm text-muted">Nothing to ship — digital products or services only.</p>
            </Panel>
          )}

          <Panel title="Billing address">
            {billingAddress ? (
              <AddressBlock address={billingAddress} />
            ) : (
              <p className="text-sm text-muted">Not recorded on this order.</p>
            )}
          </Panel>

          {order.note ? (
            <Panel title="Note from the customer">
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

function AddressBlock({ address }: { address: PostalAddress }) {
  return (
    <address className="text-sm not-italic">
      {formatAddressLines(address, "en").map((line, index) => (
        <span key={index} className="block break-words">
          {line}
        </span>
      ))}
    </address>
  );
}
