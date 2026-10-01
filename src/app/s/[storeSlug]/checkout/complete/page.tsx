import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CartSummary } from "@/components/storefront/cart-summary";
import { getPlacedOrder } from "@/lib/checkout/orders";
import { INTL_LOCALES } from "@/lib/i18n/locales";
import { format } from "@/lib/i18n/messages";
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

type Snapshot = { discountId: string; title: string; code: string | null; amountCents: number };

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
 * The order just placed. Found through a short-lived cookie set by the
 * checkout action, not a URL, so there is nothing here to share or guess.
 */
export default async function CheckoutCompletePage(
  props: PageProps<"/s/[storeSlug]/checkout/complete">,
) {
  const { storeSlug } = await props.params;
  const store = await getStoreBySlug(storeSlug);
  if (!store || !isStorePubliclyVisible(store)) notFound();

  const paths = storefrontPaths(store.slug);
  const [{ locale, t }, order] = await Promise.all([
    getStorefrontI18n(),
    getPlacedOrder(store.id),
  ]);
  if (!order) redirect(paths.home);

  const money = (cents: number) => formatMoney(cents, undefined, INTL_LOCALES[locale]);
  const discounts = snapshotEntries(order.appliedDiscounts);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <p className="text-sm font-medium" style={{ color: "var(--store-accent)" }}>
        {format(t.orderComplete.orderNumber, { number: order.orderNumber })}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">
        {t.orderComplete.title}
      </h1>
      <p className="mt-3 text-muted">
        {format(t.orderComplete.savedFor, { email: order.email })}{" "}
        {t.orderComplete.notCharged}
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
          showShipping
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

      <Link
        href={paths.catalog}
        className="mt-8 inline-flex h-11 items-center rounded-lg px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: "var(--store-accent)" }}
      >
        {t.orderComplete.continueShopping}
      </Link>
    </div>
  );
}
