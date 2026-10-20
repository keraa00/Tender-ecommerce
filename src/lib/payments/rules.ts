import type Stripe from "stripe";

import type { PostalAddress } from "@/lib/address/types";
import { OrderStatus, StoreStatus, type CartKind, type Order } from "@/lib/db/types";
import type { Locale } from "@/lib/i18n/locales";

/**
 * The pure half of payments: how a Stripe account maps onto a store, what a
 * PaymentIntent for an order looks like, and what a PaymentIntent's state means
 * for the order. No `server-only`, no database, no network — so all of it is
 * unit-tested, and the server modules around it stay thin.
 */

// ---------------------------------------------------------------------------
// Connected accounts
// ---------------------------------------------------------------------------

/**
 * Standard-equivalent controller properties. Stripe recommends these over
 * `type: "standard"` and over OAuth for new platforms. The seller gets the full
 * Stripe Dashboard and pays Stripe's fees; Stripe collects KYC requirements and
 * carries negative-balance losses.
 */
export const CONNECT_CONTROLLER = {
  stripe_dashboard: { type: "full" },
  fees: { payer: "account" },
  losses: { payments: "stripe" },
  requirement_collection: "stripe",
} as const satisfies NonNullable<Stripe.AccountCreateParams["controller"]>;

export type StoreStripeFields = {
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  status: StoreStatus;
};

type AccountState = Pick<Stripe.Account, "charges_enabled" | "payouts_enabled" | "details_submitted">;

/**
 * The store columns an account's state implies.
 *
 * A new store is PENDING and nothing else ever activates it, so finishing
 * onboarding is what opens it: PENDING becomes ACTIVE once Stripe has the
 * seller's details and lets them charge. It never goes the other way — a store
 * whose charges are paused stays ACTIVE and `stripeChargesEnabled` gates
 * checkout — and a SUSPENDED store is the platform's decision, not Stripe's.
 */
export function storeFieldsFromAccount(account: AccountState, status: StoreStatus): StoreStripeFields {
  const ready = Boolean(account.details_submitted) && Boolean(account.charges_enabled);
  return {
    stripeOnboardingComplete: Boolean(account.details_submitted),
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    status: status === StoreStatus.PENDING && ready ? StoreStatus.ACTIVE : status,
  };
}

/**
 * True when Stripe says the stored account id cannot be used at all — it does
 * not exist, or the platform no longer has access to it (an old placeholder,
 * a test id under a live key). Only then is a new account created in its
 * place. A network blip, a 5xx or a bad API key is not that, and replacing a
 * seller's real account because of one would orphan their payments.
 */
export function isAccountUnreachable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, type, statusCode } = error as {
    code?: unknown;
    type?: unknown;
    statusCode?: unknown;
  };
  if (code === "resource_missing" || code === "account_invalid") return true;
  if (type === "StripePermissionError") return true;
  return statusCode === 404;
}

// ---------------------------------------------------------------------------
// PaymentIntents
// ---------------------------------------------------------------------------

/** Metadata key linking a PaymentIntent back to its order. */
export const ORDER_METADATA_KEY = "tender_order_id";

type IntentOrder = Pick<
  Order,
  "id" | "storeId" | "orderNumber" | "email" | "currency" | "totalCents" | "platformFeeCents"
>;

/**
 * The PaymentIntent for an order, created on the seller's account.
 *
 * The commission rides along as `application_fee_amount` — omitted at zero,
 * where Stripe would refuse it. The cart goes in metadata so the transaction
 * that settles the order can empty the cart it came from; the cart kind lets
 * a failed payment send the buyer back to the right checkout.
 *
 * Keyed on the order id: retrying the call after a timeout returns the same
 * PaymentIntent instead of charging twice.
 */
export function orderPaymentIntentParams(
  order: IntentOrder,
  store: { name: string },
  cart: { id: string; kind: CartKind },
): { params: Stripe.PaymentIntentCreateParams; idempotencyKey: string } {
  return {
    params: {
      amount: order.totalCents,
      currency: order.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      ...(order.platformFeeCents > 0 ? { application_fee_amount: order.platformFeeCents } : {}),
      receipt_email: order.email,
      description: `${store.name} order #${order.orderNumber}`,
      metadata: {
        [ORDER_METADATA_KEY]: order.id,
        store_id: order.storeId,
        cart_id: cart.id,
        cart_kind: cart.kind,
        order_number: String(order.orderNumber),
      },
    },
    idempotencyKey: `pi:${order.id}`,
  };
}

type IntentState = Pick<Stripe.PaymentIntent, "amount" | "currency">;

/**
 * Why a PaymentIntent cannot settle this order, or null when it can. A
 * succeeded PaymentIntent for another seller's account, another amount or
 * another currency is a bug or a forgery, never a payment for this order.
 */
export function paymentMismatch(
  order: Pick<Order, "totalCents" | "currency" | "stripeAccountId">,
  intent: IntentState,
  accountId: string | null,
): "account" | "amount" | "currency" | null {
  if (!accountId || order.stripeAccountId !== accountId) return "account";
  if (intent.amount !== order.totalCents) return "amount";
  if (intent.currency.toLowerCase() !== order.currency.toLowerCase()) return "currency";
  return null;
}

export type PaymentOutcome = "paid" | "processing" | "failed" | "cancelled";

/**
 * What the buyer is told on the confirmation page. The order's own status
 * wins once it has one; while it is still PENDING, the PaymentIntent says
 * whether the money is in, on its way (bank debits clear over days), or not
 * coming — a declined card, or a 3-D Secure challenge the buyer walked away
 * from.
 */
export function paymentOutcome(
  orderStatus: OrderStatus,
  intentStatus: Stripe.PaymentIntent.Status | null,
): PaymentOutcome {
  if (orderStatus === OrderStatus.PAID || orderStatus === OrderStatus.FULFILLED) return "paid";
  if (orderStatus === OrderStatus.CANCELLED) return "cancelled";
  if (intentStatus === "succeeded") return "paid";
  if (intentStatus === "processing" || intentStatus === "requires_capture") return "processing";
  return "failed";
}

/**
 * What to do with an earlier, still-unpaid attempt when the buyer places the
 * order again — after a reload, or after changing their address. Its money may
 * already be in (`settle`) or on its way (`wait`); otherwise the old order is
 * cancelled so its discount uses are released before the new one redeems them.
 */
export function supersedeAction(
  intentStatus: Stripe.PaymentIntent.Status,
): "settle" | "wait" | "cancel" | "gone" {
  if (intentStatus === "succeeded") return "settle";
  if (intentStatus === "processing" || intentStatus === "requires_capture") return "wait";
  if (intentStatus === "canceled") return "gone";
  return "cancel";
}

export type StripeBillingDetails = {
  name: string;
  email: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
};

/**
 * The billing details the checkout form already collected, in the shape
 * `confirmPayment` takes. The Payment Element is told not to ask for name,
 * email or address, and Stripe then requires every one of those fields to be
 * passed — empty strings for the ones the buyer was not asked for.
 */
export function stripeBillingDetails(email: string, address: PostalAddress): StripeBillingDetails {
  return {
    name: [address.firstName, address.lastName].filter(Boolean).join(" "),
    email,
    address: {
      line1: address.line1,
      line2: address.line2 ?? "",
      city: address.city,
      state: address.regionCode ?? address.region ?? "",
      postal_code: address.postalCode ?? "",
      country: address.countryCode,
    },
  };
}

/**
 * The storefront language as a Stripe Elements locale. Stripe has no Bosnian;
 * Croatian is the closest it offers and reads naturally to the same buyers.
 */
export function stripeLocale(locale: Locale): "ar" | "de" | "en" | "es" | "fr" | "hr" | "it" | "ja" | "pt" | "ru" | "tr" | "zh" {
  return locale === "bs" ? "hr" : locale;
}
