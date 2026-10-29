import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { localeDirection } from "@/lib/i18n/locales";
import { format } from "@/lib/i18n/messages";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { getStoreBySlug } from "@/lib/stores/queries";
import { isStorePubliclyVisible } from "@/lib/stores/policy";

/**
 * A storefront's pages name the store themselves ("Mug · Nordhavn Supply").
 * Without this, the platform's "%s · Tender" template from the root layout
 * would sign every one of them as Tender's.
 */
export const metadata: Metadata = {
  title: { template: "%s", default: "Store" },
};

/**
 * One storefront, whichever chrome it is drawn in: the themed header, footer
 * and cart drawer of `(shop)`, or the pared-down header of `(checkout)`, where
 * the store's navigation would only be a way out of paying.
 *
 * What both share is decided here, once: the store exists, and a suspended
 * one shows buyers nothing but that it is closed.
 */
export default async function StorefrontLayout({
  children,
  params,
}: LayoutProps<"/s/[storeSlug]">) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);

  if (!store) notFound();

  if (!isStorePubliclyVisible(store)) {
    const { locale, t } = await getStorefrontI18n();
    return (
      // Outside the storefront frame, so it pins the storefront's light palette
      // itself: see "Storefront theme settings" in `globals.css`.
      <div
        data-color-scheme="light"
        lang={locale}
        dir={localeDirection(locale)}
        className="grid flex-1 place-items-center px-4 py-24 text-center"
      >
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">{t.store.unavailable}</h1>
          <p className="mt-2 text-sm text-muted text-pretty">
            {format(t.store.suspended, { store: store.name })}
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
          >
            {t.store.browseOther}
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
