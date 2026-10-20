import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CartLineList } from "@/components/storefront/cart-lines";
import { CartSummary } from "@/components/storefront/cart-summary";
import { CheckoutButton } from "@/components/storefront/checkout-button";
import { DiscountCodeForm } from "@/components/storefront/discount-code-form";
import {
  applyDiscountCodeAction,
  removeDiscountCodeAction,
  updateCartLineAction,
} from "@/lib/cart/actions";
import { cartCheckoutBlock } from "@/lib/checkout/availability";
import { getCartPricing } from "@/lib/checkout/pricing";
import { CartKind } from "@/lib/db/types";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { discountCodeErrors, toCartDisplay } from "@/lib/storefront/cart-display";
import { storefrontPaths } from "@/lib/storefront/links";
import { getStoreBySlug } from "@/lib/stores/queries";

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]/cart">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [store, { t }] = await Promise.all([
    getStoreBySlug(storeSlug),
    getStorefrontI18n(),
  ]);
  return {
    title: store ? `${t.cart.title} · ${store.name}` : t.cart.title,
    robots: { index: false },
  };
}

/**
 * The full-page cart. The drawer covers the same ground; this is where the
 * header's cart link lands before JavaScript has loaded, and where "View cart"
 * goes for a roomier look.
 */
export default async function CartPage(props: PageProps<"/s/[storeSlug]/cart">) {
  const { storeSlug } = await props.params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();

  const [{ locale, t }, { cart: cartView, pricing }] = await Promise.all([
    getStorefrontI18n(),
    getCartPricing(store.id),
  ]);
  const cart = toCartDisplay(cartView, pricing, store, locale);
  const blocked = await cartCheckoutBlock(store, cartView);
  const paths = storefrontPaths(store.slug);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t.cart.title}</h1>

      {cart.lines.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border-strong px-6 py-16 text-center">
          <p className="font-medium">{t.cart.empty}</p>
          <p className="mt-1 text-sm text-muted">{t.cart.emptyHint}</p>
          <Link
            href={paths.catalog}
            className="mt-6 inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium transition-colors hover:bg-surface-hover"
          >
            {t.cart.continueShopping}
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="border-t border-border">
            <CartLineList
              lines={cart.lines}
              t={t.cart}
              updateLine={updateCartLineAction.bind(null, store.slug)}
              size="roomy"
            />
          </div>

          <aside className="h-fit space-y-4 rounded-2xl border border-border bg-surface-subtle p-6 lg:sticky lg:top-24">
            <p className="text-sm text-muted">{cart.itemCountLabel}</p>
            <CartSummary cart={cart} t={t.cart} />
            <DiscountCodeForm
              codes={cart.codes}
              t={t.discountCode}
              errors={discountCodeErrors(locale)}
              apply={applyDiscountCodeAction.bind(null, store.slug, CartKind.STANDARD)}
              remove={removeDiscountCodeAction.bind(null, store.slug, CartKind.STANDARD)}
            />
            <p className="text-xs text-muted">{t.cart.shippingNote}</p>
            <CheckoutButton
              t={t.cart}
              href={blocked ? null : paths.checkout}
              reason={blocked === "no-shipping" ? t.cart.noShipping : null}
            />
            <Link
              href={paths.catalog}
              className="block text-center text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
            >
              {t.cart.continueShopping}
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
