import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CheckoutForm } from "@/components/storefront/checkout-form";
import { DiscountCodeForm } from "@/components/storefront/discount-code-form";
import { getCurrentUser } from "@/lib/auth/session";
import { applyDiscountCodeAction, removeDiscountCodeAction } from "@/lib/cart/actions";
import { placeOrderAction, setCheckoutEmailAction } from "@/lib/checkout/actions";
import { getCartPricing, priceCart } from "@/lib/checkout/pricing";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { discountCodeErrors, toCartDisplay } from "@/lib/storefront/cart-display";
import { storefrontPaths } from "@/lib/storefront/links";
import { canAcceptOrders, isStorePubliclyVisible } from "@/lib/stores/policy";
import { getStoreBySlug } from "@/lib/stores/queries";

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]/checkout">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [store, { t }] = await Promise.all([getStoreBySlug(storeSlug), getStorefrontI18n()]);
  return {
    title: store ? `${t.checkout.title} · ${store.name}` : t.checkout.title,
    robots: { index: false },
  };
}

export default async function CheckoutPage(props: PageProps<"/s/[storeSlug]/checkout">) {
  const { storeSlug } = await props.params;
  const store = await getStoreBySlug(storeSlug);
  if (!store || !isStorePubliclyVisible(store)) notFound();

  const paths = storefrontPaths(store.slug);
  const [{ locale, t }, { cart: cartView, pricing: cartPricing }, user] = await Promise.all([
    getStorefrontI18n(),
    getCartPricing(store.id),
    getCurrentUser(),
  ]);

  if (!cartView.lines.some((line) => line.available)) redirect(paths.cart);

  if (!canAcceptOrders(store)) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t.checkout.title}</h1>
        <p className="mt-4 text-muted">{t.checkout.unavailable}</p>
        <Link
          href={paths.cart}
          className="mt-6 inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium transition-colors hover:bg-surface-hover"
        >
          {t.checkout.backToCart}
        </Link>
      </div>
    );
  }

  // The drawer prices anonymously to spare every page a round trip to Supabase;
  // checkout asks who is signed in, and prices for them — the email on the
  // cart first, else the account's.
  const email = cartView.email ?? user?.email.toLowerCase() ?? null;
  const pricing =
    user || email !== cartView.email
      ? await priceCart(store.id, cartView, { email, userId: user?.id ?? null })
      : cartPricing;
  const cart = toCartDisplay(cartView, pricing, store.slug, locale);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t.checkout.title}</h1>
      <div className="mt-8">
        <CheckoutForm
          cart={cart}
          t={t.checkout}
          cartT={t.cart}
          initialEmail={email ?? ""}
          placeOrder={placeOrderAction.bind(null, store.slug)}
          saveEmail={setCheckoutEmailAction.bind(null, store.slug)}
          cartHref={paths.cart}
          codeForm={
            <DiscountCodeForm
              codes={cart.codes}
              t={t.discountCode}
              errors={discountCodeErrors(locale)}
              apply={applyDiscountCodeAction.bind(null, store.slug)}
              remove={removeDiscountCodeAction.bind(null, store.slug)}
            />
          }
        />
      </div>
    </div>
  );
}
