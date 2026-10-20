import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CartSummary } from "@/components/storefront/cart-summary";
import { formatAddressLines, readAddress } from "@/lib/address/validate";
import type { PostalAddress } from "@/lib/address/types";
import { getPlacedOrder } from "@/lib/checkout/orders";
import { findOrderByPaymentReturn, syncPlacedOrderPayment } from "@/lib/checkout/payment";
import { CartKind } from "@/lib/db/types";
import { INTL_LOCALES } from "@/lib/i18n/locales";
import { format, plural, type Messages } from "@/lib/i18n/messages";
import type { PaymentOutcome } from "@/lib/payments/rules";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { storefrontPaths } from "@/lib/storefront/links";
import { isStorePubliclyVisible } from "@/lib/stores/policy";
import { getStoreBySlug } from "@/lib/stores/queries";

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]/checkout/complete">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [store, { t }] = await Promise.all([getStoreBySlug(storeSlug), getStorefrontI18n()]);
  return {
    title: store ? `${t.orderComplete.title} · ${store.name}` : t.orderComplete.title,
    robots: { index: false },
  };
}

type Snapshot = {
  discountId: string;
  title: string;
  code: string | null;
  amountCents: number;
  /** What it took off shipping; absent on orders from before shipping rates. */
  shippingCents?: number;
};

/** The order's discount snapshot, read defensively: it is JSON, not a table. */
function snapshotEntries(value: unknown): Snapshot[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Snapshot =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Snapshot).discountId === "string" &&
      typeof (entry as Snapshot).title === "string" &&
      typeof (entry as Snapshot).amountCents === "number",
  );
}

/**
 * The order just placed, and where its payment stands. Stripe sends the buyer
 * here once the Payment Element has confirmed — or failed to, after a bank's
 * own page.
 *
 * The order is found through a short-lived cookie set by the checkout action,
 * not a URL, so there is nothing here to share or guess. The payment is read
 * from Stripe rather than from the query string Stripe appends, and settled
 * on the spot if it succeeded, so this page is right before the webhook lands.
 */
export default async function CheckoutCompletePage(
  props: PageProps<"/s/[storeSlug]/checkout/complete">,
) {
  const [{ storeSlug }, search] = await Promise.all([props.params, props.searchParams]);
  const store = await getStoreBySlug(storeSlug);
  if (!store || !isStorePubliclyVisible(store)) notFound();

  const paths = storefrontPaths(store.slug);
  const [{ locale, t }, order] = await Promise.all([
    getStorefrontI18n(),
    getPlacedOrder(store.id),
  ]);

  if (!order) {
    const returned = await findOrderByPaymentReturn(
      store.id,
      search.payment_intent,
      search.payment_intent_client_secret,
    );
    if (!returned) redirect(paths.home);
    const { outcome, cartKind } = await syncPlacedOrderPayment(returned);
    return (
      <PaymentStatus
        t={t}
        orderNumber={returned.orderNumber}
        outcome={outcome}
        retryHref={cartKind === CartKind.BUY_NOW ? paths.checkoutBuyNow : paths.checkout}
        continueHref={paths.catalog}
      />
    );
  }

  const { outcome, cartKind } = await syncPlacedOrderPayment(order);
  if (outcome === "failed" || outcome === "cancelled") {
    return (
      <PaymentStatus
        t={t}
        orderNumber={order.orderNumber}
        outcome={outcome}
        retryHref={cartKind === CartKind.BUY_NOW ? paths.checkoutBuyNow : paths.checkout}
        continueHref={paths.catalog}
      />
    );
  }

  const intl = INTL_LOCALES[locale];
  const money = (cents: number) => formatMoney(cents, order.currency, intl);
  const discounts = snapshotEntries(order.appliedDiscounts);
  const shippingAddress = readAddress(order.shippingAddress);
  const billingAddress = readAddress(order.billingAddress);

  // What a free-shipping discount took off the rate, from the snapshot.
  const shippingDiscount = discounts.reduce((sum, entry) => sum + (entry.shippingCents ?? 0), 0);
  const shippingLine = shippingAddress
    ? order.shippingCents === 0 || shippingDiscount >= order.shippingCents
      ? {
          value: t.checkout.free,
          struck: order.shippingCents > 0 ? money(order.shippingCents) : null,
        }
      : { value: money(order.shippingCents - shippingDiscount), struck: null }
    : null;

  const estimate =
    order.shippingMinDays === null || order.shippingMaxDays === null
      ? null
      : order.shippingMinDays === order.shippingMaxDays
        ? plural(locale, order.shippingMinDays, t.checkout.deliveryDays)
        : format(t.checkout.deliveryRange, {
            min: order.shippingMinDays,
            max: order.shippingMaxDays,
          });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <p className="text-sm font-medium" style={{ color: "var(--store-accent)" }}>
        {format(t.orderComplete.orderNumber, { number: order.orderNumber })}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">
        {t.orderComplete.title}
      </h1>
      <p className="mt-3 text-muted">
        {outcome === "paid" ? t.orderComplete.paid : t.orderComplete.processing}{" "}
        {format(t.orderComplete.savedFor, { email: order.email })}
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-surface-subtle p-6">
        <ul className="divide-y divide-border">
          {order.lines.map((line) => {
            const lineTotal = line.unitPriceCents * line.quantity;
            return (
              <li key={line.id} className="flex items-center gap-3 py-3 text-sm">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface">
                  {line.imageUrlSnapshot ? (
                    <Image
                      src={line.imageUrlSnapshot}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2">
                    {line.titleSnapshot}
                    <span className="text-muted"> × {line.quantity}</span>
                  </span>
                  {line.variantTitleSnapshot.toLowerCase() !== "default" ? (
                    <span className="block text-muted">{line.variantTitleSnapshot}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-end tabular">
                  {line.discountCents > 0 ? (
                    <>
                      <del className="block text-xs text-muted">{money(lineTotal)}</del>
                      <ins className="block text-success no-underline">
                        {money(lineTotal - line.discountCents)}
                      </ins>
                    </>
                  ) : (
                    money(lineTotal)
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        <CartSummary
          className="mt-4"
          t={t.cart}
          shipping={shippingLine}
          cart={{
            subtotal: money(order.subtotalCents),
            total: money(order.totalCents),
            discounts: discounts.map((entry) => ({
              id: entry.discountId,
              title: entry.title,
              code: entry.code,
              amount: entry.amountCents > 0 ? money(-entry.amountCents) : null,
            })),
          }}
        />
      </div>

      <dl className="mt-6 grid gap-6 rounded-2xl border border-border p-6 text-sm sm:grid-cols-2">
        {shippingAddress ? (
          <Detail label={t.orderComplete.shippingTo}>
            <AddressBlock address={shippingAddress} locale={intl} />
          </Detail>
        ) : null}
        {order.shippingRateName ? (
          <Detail label={t.orderComplete.shippingMethod}>
            <p>{order.shippingRateName}</p>
            {estimate ? <p className="text-muted">{estimate}</p> : null}
          </Detail>
        ) : null}
        {billingAddress ? (
          <Detail label={t.orderComplete.billingTo}>
            <AddressBlock address={billingAddress} locale={intl} />
          </Detail>
        ) : null}
        {order.note ? (
          <Detail label={t.orderComplete.note}>
            <p className="whitespace-pre-line break-words">{order.note}</p>
          </Detail>
        ) : null}
      </dl>

      <Link
        href={paths.catalog}
        className="mt-8 inline-flex h-11 items-center rounded-lg px-5 text-sm font-medium text-white bg-store-accent transition-colors hover:bg-store-accent-hover"
      >
        {t.orderComplete.continueShopping}
      </Link>
    </div>
  );
}

/**
 * Where the payment stands, and nothing else about the order: a failed or
 * cancelled payment, or a return from Stripe without the cookie — where all
 * that is proven is that the visitor holds the payment's client secret.
 */
function PaymentStatus({
  t,
  orderNumber,
  outcome,
  retryHref,
  continueHref,
}: {
  t: Messages;
  orderNumber: number;
  outcome: PaymentOutcome;
  retryHref: string;
  continueHref: string;
}) {
  const failed = outcome === "failed" || outcome === "cancelled";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <p className="text-sm font-medium" style={{ color: "var(--store-accent)" }}>
        {format(t.orderComplete.orderNumber, { number: orderNumber })}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">
        {failed ? t.orderComplete.failedTitle : t.orderComplete.title}
      </h1>
      <p role={failed ? "alert" : undefined} className="mt-3 text-muted text-pretty">
        {failed
          ? format(t.orderComplete.failedBody, { number: orderNumber })
          : outcome === "paid"
            ? t.orderComplete.paid
            : t.orderComplete.processing}
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        {failed ? (
          <Link
            href={retryHref}
            className="inline-flex h-11 items-center rounded-lg px-5 text-sm font-medium text-white bg-store-accent transition-colors hover:bg-store-accent-hover"
          >
            {t.orderComplete.retry}
          </Link>
        ) : null}
        <Link
          href={continueHref}
          className={
            failed
              ? "inline-flex h-11 items-center rounded-lg border border-border-strong px-5 text-sm font-medium transition-colors hover:bg-surface-hover"
              : "inline-flex h-11 items-center rounded-lg px-5 text-sm font-medium text-white bg-store-accent transition-colors hover:bg-store-accent-hover"
          }
        >
          {t.orderComplete.continueShopping}
        </Link>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function AddressBlock({ address, locale }: { address: PostalAddress; locale: string }) {
  return (
    <address className="not-italic">
      {formatAddressLines(address, locale).map((line, index) => (
        <span key={index} className="block">
          {line}
        </span>
      ))}
      {address.phone ? <span className="block text-muted">{address.phone}</span> : null}
    </address>
  );
}
