import "server-only";

import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { CheckoutForm } from "@/components/storefront/checkout-form";
import { DiscountCodeForm } from "@/components/storefront/discount-code-form";
import type {
  CheckoutPaymentDisplay,
  CheckoutShippingDisplay,
  CodPaymentDisplay,
  CountryOptionDisplay,
  StripePaymentDisplay,
} from "@/components/storefront/types";
import { countryOptions, DELIVERABLE_COUNTRY_CODES } from "@/lib/address/countries";
import { destinationOf } from "@/lib/address/validate";
import { getCurrentUser } from "@/lib/auth/session";
import { applyDiscountCodeAction, removeDiscountCodeAction } from "@/lib/cart/actions";
import { getCart } from "@/lib/cart/queries";
import { placeOrderAction, saveCheckoutAction } from "@/lib/checkout/actions";
import { preferredCountry } from "@/lib/checkout/country";
import { billingAddressRules, shippingAddressRules } from "@/lib/checkout/fields";
import { checkoutPaymentOptions } from "@/lib/checkout/payment";
import { priceCheckout } from "@/lib/checkout/pricing";
import { getSavedCheckout } from "@/lib/checkout/saved";
import type { CheckoutQuote } from "@/lib/checkout/quote";
import { CartKind } from "@/lib/db/types";
import { INTL_LOCALES, type Locale } from "@/lib/i18n/locales";
import { format, plural, type Messages } from "@/lib/i18n/messages";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import type { CodSettings } from "@/lib/payments/cod";
import { loadZoneRules } from "@/lib/shipping/queries";
import { shipsAnywhere, shipsTo, type RateRule } from "@/lib/shipping/rates";
import { stripeLocale } from "@/lib/payments/rules";
import { discountCodeErrors, toCartDisplay } from "@/lib/storefront/cart-display";
import { storefrontPaths } from "@/lib/storefront/links";
import { checkoutBlockedReason, isStorePubliclyVisible, type CheckoutBlock } from "@/lib/stores/policy";
import { getStoreBySlug } from "@/lib/stores/queries";
import { stripePublishableKey } from "@/lib/stripe/server";
import { getPublishedTheme } from "@/lib/theme/queries";

/**
 * A checkout page, for either of a browser's carts: the everyday one, or the
 * single item "Buy it now" put in a cart of its own. Everything priced here is
 * priced from the cart and the store — the client gets display strings and a
 * total to echo back, nothing it could change to change what it pays.
 */
export async function CheckoutView({ storeSlug, kind }: { storeSlug: string; kind: CartKind }) {
  const store = await getStoreBySlug(storeSlug);
  if (!store || !isStorePubliclyVisible(store)) notFound();

  const paths = storefrontPaths(store.slug);
  const [{ locale, t }, cart, user, zones, requestHeaders, theme] = await Promise.all([
    getStorefrontI18n(),
    getCart(store.id, kind),
    getCurrentUser(),
    loadZoneRules(store.id),
    headers(),
    getPublishedTheme(store.id),
  ]);

  if (!cart.lines.some((line) => line.available)) redirect(paths.cart);

  const needsShipping = cart.lines.some((line) => line.available && line.requiresShipping);
  const blocked = checkoutBlockedReason(store, {
    requiresShipping: needsShipping,
    shipsAnywhere: shipsAnywhere(zones),
  });
  if (blocked) return <Blocked reason={blocked} t={t} cartHref={paths.cart} />;

  // A store can be fully onboarded on a server with no Stripe keys (a fresh
  // checkout of the repo). Unless it also takes cash on delivery, nothing could
  // take the payment, so say so.
  const options = checkoutPaymentOptions(store);
  const publishableKey = stripePublishableKey();
  const intl = INTL_LOCALES[locale];
  const stripe: StripePaymentDisplay | null =
    options.stripe && publishableKey && store.stripeAccountId
      ? {
          publishableKey,
          stripeAccountId: store.stripeAccountId,
          currency: store.currency.toLowerCase(),
          locale: stripeLocale(locale),
          accentColor: theme.settings.accent ?? store.accentColor,
        }
      : null;
  if (!stripe && !options.cod) {
    return <Blocked reason="unavailable" t={t} cartHref={paths.cart} />;
  }

  const coverage = shipsTo(zones);
  const shippable = coverage.everywhere ? DELIVERABLE_COUNTRY_CODES : coverage.countryCodes;

  // Start the country select somewhere sensible, and only ever somewhere the
  // store ships: what the buyer chose before, their browser's region, their
  // language's region, or where the store's first zone is.
  // A checkout not yet begun on this cart starts from what the buyer saved
  // last time, if they did; once they have typed anything, that wins. Either
  // way the page below is priced from it — rates, fees, discounts.
  const saved = cart.hasCheckoutDraft ? null : await getSavedCheckout(store.id);
  const draft = saved?.draft ?? cart.checkoutDraft;
  const firstCountry = zones.find((zone) => !zone.restOfWorld)?.countries[0]?.countryCode;
  const country = preferredCountry({
    saved: draft.shipping.countryCode,
    acceptLanguage: requestHeaders.get("accept-language"),
    locale: intl,
    shipsTo: coverage.everywhere ? null : coverage.countryCodes,
    fallback: firstCountry,
  });
  const shipping = { ...draft.shipping, countryCode: country ?? "" };
  // A card can be billed anywhere; start it where the parcel is going.
  const billing = {
    ...draft.billing,
    countryCode: draft.billing.countryCode || shipping.countryCode,
  };

  // The drawer prices anonymously to spare every page a round trip to
  // Supabase; checkout asks who is signed in, and prices for them — the email
  // on the cart first, then the one saved for next time, else the account's.
  const email = cart.email ?? saved?.email ?? user?.email.toLowerCase() ?? null;
  const shippingRules = shippingAddressRules(store);
  const quote = await priceCheckout(
    store.id,
    cart,
    { email, userId: user?.id ?? null },
    {
      destination: needsShipping ? destinationOf(shipping, shippingRules) : null,
      requestedRateId: cart.shippingRateId,
    },
    {
      stripe: stripe !== null,
      cod: options.cod,
      requested: draft.paymentMethod,
      countryCode: needsShipping && shipping.countryCode ? shipping.countryCode : null,
    },
  );

  const money = (cents: number) => formatMoney(cents, store.currency, intl);
  // Keyed: React treats a server element placed among a client component's
  // children as part of a list.
  const codeForm = (key: string) => (
    <DiscountCodeForm
      key={key}
      codes={display.codes}
      t={t.discountCode}
      errors={discountCodeErrors(locale)}
      apply={applyDiscountCodeAction.bind(null, store.slug, kind)}
      remove={removeDiscountCodeAction.bind(null, store.slug, kind)}
    />
  );
  const display = toCartDisplay(cart, quote.pricing, store, locale);
  const countries = (codes: readonly string[]): CountryOptionDisplay[] => countryOptions(codes, intl);

  return (
    <CheckoutForm
      cart={display}
      t={t.checkout}
      cartT={t.cart}
      initialEmail={email ?? ""}
      draft={{ ...draft, shipping, billing }}
      needsShipping={needsShipping}
      shippingCountries={countries(shippable)}
      billingCountries={countries(DELIVERABLE_COUNTRY_CODES)}
      shippingRules={shippingRules}
      billingRules={billingAddressRules(store, needsShipping)}
      orderNote={store.checkoutOrderNote}
      marketingOptIn={store.checkoutMarketingOptIn}
      shipping={shippingDisplay(quote, t, locale, money)}
      payment={paymentDisplay(quote, stripe, options.cod, t, money)}
      placeOrder={placeOrderAction.bind(null, store.slug, kind)}
      save={saveCheckoutAction.bind(null, store.slug, kind)}
      cartHref={paths.cart}
      completeHref={paths.checkoutComplete}
      codeForms={{ folded: codeForm("folded"), aside: codeForm("aside") }}
    />
  );
}

/** "2–4 business days", "1 business day", or nothing. */
function estimate(rate: RateRule, t: Messages, locale: Locale): string | null {
  const { minDeliveryDays: min, maxDeliveryDays: max } = rate;
  if (min === null || max === null) return null;
  if (min === max) return plural(locale, min, t.checkout.deliveryDays);
  return format(t.checkout.deliveryRange, { min, max });
}

function shippingDisplay(
  quote: CheckoutQuote,
  t: Messages,
  locale: Locale,
  money: (cents: number) => string,
): CheckoutShippingDisplay {
  const { shipping, pricing } = quote;
  if (shipping.state !== "ready") {
    return { state: shipping.state, rates: [], selectedId: null, summary: null };
  }

  const price = (cents: number) => (cents === 0 ? t.checkout.free : money(cents));
  const discounted = pricing.shippingDiscountCents > 0;

  return {
    state: "ready",
    rates: shipping.rates.map((rate) => ({
      id: rate.id,
      name: rate.name,
      price: price(rate.priceCents),
      estimate: estimate(rate, t, locale),
    })),
    selectedId: shipping.selected.id,
    summary: discounted
      ? {
          value: price(pricing.shippingCents - pricing.shippingDiscountCents),
          struck: money(pricing.shippingCents),
        }
      : { value: price(pricing.shippingCents), struck: null },
  };
}

function paymentDisplay(
  quote: CheckoutQuote,
  stripe: StripePaymentDisplay | null,
  settings: CodSettings | null,
  t: Messages,
  money: (cents: number) => string,
): CheckoutPaymentDisplay {
  return {
    stripe,
    cod: settings ? codDisplay(quote, settings, t, money) : null,
    selected: quote.payment.selected,
  };
}

/**
 * Cash on delivery as an option for this order, worded for the buyer. Left
 * out where it could never apply — nothing in the cart is delivered — and
 * shown, but not choosable, where only this order's country or total is the
 * problem, so the buyer knows what would change it.
 */
function codDisplay(
  quote: CheckoutQuote,
  settings: CodSettings,
  t: Messages,
  money: (cents: number) => string,
): CodPaymentDisplay | null {
  const cod = quote.payment.cod;
  if (!cod || (!cod.available && (cod.reason === "disabled" || cod.reason === "no-shipping"))) {
    return null;
  }

  const copy = t.checkout.cod;
  let unavailable: string | null = null;
  if (!cod.available) {
    switch (cod.reason) {
      case "country":
        unavailable = copy.unavailable.country;
        break;
      case "below-minimum":
        unavailable = format(copy.unavailable.belowMinimum, { amount: money(settings.minTotalCents ?? 0) });
        break;
      case "above-maximum":
        unavailable = format(copy.unavailable.aboveMaximum, { amount: money(settings.maxTotalCents ?? 0) });
        break;
    }
  }

  return {
    label: settings.label ?? copy.label,
    instructions: settings.instructions,
    feeHint: cod.available && cod.feeCents > 0 ? format(copy.feeHint, { fee: money(cod.feeCents) }) : null,
    unavailable,
    requiresPhone: settings.requirePhone,
  };
}

const BLOCK_MESSAGES: Record<CheckoutBlock, keyof Messages["checkout"]["blocked"]> = {
  suspended: "suspended",
  "payments-not-set-up": "paymentsNotSetUp",
  "payments-on-hold": "paymentsOnHold",
  unavailable: "unavailable",
  "no-shipping": "noShipping",
  "cod-needs-shipping": "codNeedsShipping",
};

function Blocked({ reason, t, cartHref }: { reason: CheckoutBlock; t: Messages; cartHref: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t.checkout.title}</h1>
      <p role="status" className="mt-4 text-muted text-pretty">
        {t.checkout.blocked[BLOCK_MESSAGES[reason]]}
      </p>
      <Link
        href={cartHref}
        className="mt-6 inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium transition-colors hover:bg-surface-hover"
      >
        {t.checkout.backToCart}
      </Link>
    </div>
  );
}
