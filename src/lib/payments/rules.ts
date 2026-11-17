import type Stripe from "stripe";

import type { PostalAddress } from "@/lib/address/types";
import { OrderStatus, PaymentMethod, StoreStatus, type CartKind, type Order } from "@/lib/db/types";
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
 * Where a seller can be based to take card payments with Stripe — the
 * countries stripe.com/global lists for self-serve sign-up, leaving out those
 * in preview (India, Indonesia) and those served through Paystack. Stripe's
 * Country Specs API lists far more, but many of those only receive
 * cross-border payouts and cannot be a merchant of record.
 *
 * Accounts v2 needs the country before the account exists, and it cannot
 * change afterwards, so the owner picks it before going to Stripe.
 */
export const STRIPE_MERCHANT_COUNTRIES = [
  "AE", "AT", "AU", "BE", "BG", "BR", "CA", "CH", "CY", "CZ", "DE", "DK", "EE",
  "ES", "FI", "FR", "GB", "GI", "GR", "HK", "HR", "HU", "IE", "IT", "JP", "LI",
  "LT", "LU", "LV", "MT", "MX", "MY", "NL", "NO", "NZ", "PL", "PT", "RO", "SE",
  "SG", "SI", "SK", "TH", "US",
] as const;

export function isStripeMerchantCountry(code: unknown): code is string {
  return typeof code === "string" && (STRIPE_MERCHANT_COUNTRIES as readonly string[]).includes(code);
}

/**
 * The Accounts v2 request creating a store's connected account.
 *
 * Standard-equivalent: the seller gets the full Stripe Dashboard, Stripe
 * collects its processing fees from the seller (`fees_collector: "stripe"`)
 * and carries negative-balance losses (`losses_collector: "stripe"`), which in
 * turn makes Stripe responsible for collecting KYC requirements. Neither
 * responsibility can change once set. Tender's commission is the application
 * fee on each direct charge, on top of Stripe's fee.
 *
 * The `merchant` configuration is what lets the account take payments; card
 * payments is the one capability requested, and onboarding asks only for what
 * it needs.
 */
export function connectedAccountParams(input: {
  storeId: string;
  storeSlug: string;
  storeName: string;
  ownerEmail: string;
  /** ISO 3166-1 alpha-2, one of `STRIPE_MERCHANT_COUNTRIES`. */
  country: string;
  /** Public https only; Stripe rejects localhost. */
  website: string | null;
}): Stripe.V2.Core.AccountCreateParams {
  return {
    dashboard: "full",
    contact_email: input.ownerEmail,
    display_name: input.storeName,
    identity: { country: input.country.toLowerCase() },
    defaults: {
      responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
      ...(input.website ? { profile: { business_url: input.website } } : {}),
    },
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    metadata: { store_id: input.storeId, store_slug: input.storeSlug },
    include: ACCOUNT_INCLUDE,
  };
}

/**
 * What every account read asks for. Accounts v2 returns most properties as
 * null unless they are named here.
 */
export const ACCOUNT_INCLUDE: Stripe.V2.Core.AccountRetrieveParams.Include[] = [
  "configuration.merchant",
  "requirements",
  "identity",
];

type AccountState = {
  configuration?: {
    merchant?: {
      capabilities?: {
        card_payments?: { status: string };
        stripe_balance?: { payouts?: { status: string } };
      };
    };
  };
  requirements?: {
    entries?: Array<{
      awaiting_action_from: string;
      minimum_deadline: { status: string };
    }>;
  };
};

export type AccountReadiness = {
  /** Card payments are active: checkout can charge on this account. */
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /**
   * The seller has given Stripe everything it currently asks for. Whatever is
   * left is Stripe's to do (verifying it), or not due yet.
   */
  detailsSubmitted: boolean;
  /** Requirements waiting on the seller now. */
  dueCount: number;
};

/**
 * What an Accounts v2 account's capabilities and requirements say about it.
 *
 * Card payments must be requested for onboarding to mean anything: an account
 * whose merchant configuration has no capabilities yet (one created before
 * Accounts v2, never onboarded) has no requirements listed either, and is not
 * "submitted" for having nothing to submit.
 */
export function accountReadiness(account: AccountState): AccountReadiness {
  const capabilities = account.configuration?.merchant?.capabilities;
  const cardStatus = capabilities?.card_payments?.status;
  const dueCount = (account.requirements?.entries ?? []).filter(
    (entry) => entry.awaiting_action_from === "user" && entry.minimum_deadline.status !== "eventually_due",
  ).length;

  return {
    chargesEnabled: cardStatus === "active",
    payoutsEnabled: capabilities?.stripe_balance?.payouts?.status === "active",
    detailsSubmitted: cardStatus !== undefined && dueCount === 0,
    dueCount,
  };
}

type AccountEvent =
  | { type: "account.updated"; created: number; data: { object: { charges_enabled?: boolean | null } } }
  | { type: "capability.updated"; created: number; data: { object: { id: string; status: string } } }
  | { type: string; created: number; data: { object: unknown } };

/**
 * True when a recent event says the account can now take card payments.
 *
 * The events are Accounts v1 events, and the v2 view of the account they
 * prompt a read of can lag behind them by a few seconds: an `account.updated`
 * saying `charges_enabled: true` can arrive while v2 still reports card
 * payments as restricted. A store synced from that read would stay closed
 * with the event marked handled, so for these events the read must agree
 * before the event counts. Only recent ones — an old "active" event arriving
 * after the account was restricted again must not be retried for days.
 */
export function eventSignalsCardActive(event: AccountEvent, now: Date = new Date()): boolean {
  const recent = now.getTime() / 1000 - event.created < 10 * 60;
  if (!recent) return false;
  if (event.type === "account.updated") {
    return (event.data.object as { charges_enabled?: boolean | null }).charges_enabled === true;
  }
  if (event.type === "capability.updated") {
    const capability = event.data.object as { id?: string; status?: string };
    return capability.id === "card_payments" && capability.status === "active";
  }
  return false;
}

export type StoreStripeFields = {
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  status: StoreStatus;
};

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
  const { chargesEnabled, payoutsEnabled, detailsSubmitted } = accountReadiness(account);
  return {
    stripeOnboardingComplete: detailsSubmitted,
    stripeChargesEnabled: chargesEnabled,
    stripePayoutsEnabled: payoutsEnabled,
    status: status === StoreStatus.PENDING && detailsSubmitted && chargesEnabled ? StoreStatus.ACTIVE : status,
  };
}

/**
 * True when Stripe says the stored account id cannot be used at all — it is
 * malformed (an old placeholder), does not exist, or the platform no longer
 * has access to it (a test id under a live key). Only then is a new account
 * created in its place. A network blip, a 5xx or a bad API key is not that,
 * and replacing a seller's real account because of one would orphan their
 * payments.
 *
 * For reads only: `invalid_fields` on a retrieve can only be the id, since the
 * rest of the request is fixed.
 */
export function isAccountUnreachable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, type, statusCode } = error as {
    code?: unknown;
    type?: unknown;
    statusCode?: unknown;
  };
  if (code === "resource_missing" || code === "account_invalid" || code === "invalid_fields") return true;
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

export type PaymentOutcome =
  | "paid"
  | "processing"
  | "failed"
  | "cancelled"
  /** A cash-on-delivery order, placed: the buyer pays the courier. */
  | "pay-on-delivery";

/**
 * What the buyer is told on the confirmation page. The order's own status
 * wins once it has one; while it is still PENDING, the PaymentIntent says
 * whether the money is in, on its way (bank debits clear over days), or not
 * coming — a declined card, or a 3-D Secure challenge the buyer walked away
 * from. A pending cash-on-delivery order has no PaymentIntent and nothing that
 * can fail: it is placed, to be paid at the door.
 */
export function paymentOutcome(
  orderStatus: OrderStatus,
  intentStatus: Stripe.PaymentIntent.Status | null,
  paymentMethod: PaymentMethod = PaymentMethod.STRIPE,
): PaymentOutcome {
  if (orderStatus === OrderStatus.PAID || orderStatus === OrderStatus.FULFILLED) return "paid";
  if (orderStatus === OrderStatus.CANCELLED) return "cancelled";
  if (paymentMethod === PaymentMethod.CASH_ON_DELIVERY) return "pay-on-delivery";
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

// ---------------------------------------------------------------------------
// Refunds and disputes
// ---------------------------------------------------------------------------

/**
 * What a `charge.refunded` event means for the order it refunds, given how
 * much of the charge Stripe now says is refunded in all.
 *
 * - `none`: nothing new — a redelivery, or an older event arriving after a
 *   newer one. Refunds only ever add up, so a smaller total is stale.
 * - `cancel`: the whole charge came back on an order not yet sent. It will not
 *   be sent now, so it is cancelled and its stock goes back.
 * - `record`: a partial refund, or a full one on an order already fulfilled or
 *   cancelled. The order says how much came back and otherwise stays put.
 *
 * The refunded total is capped at the order's own total: the amount Tender
 * charged is the order total, so more is not possible, and the database
 * refuses it anyway.
 */
export type RefundOutcome = "none" | "cancel" | "record";

export function refundOutcome(
  order: Pick<Order, "status" | "totalCents" | "refundedCents">,
  amountRefundedCents: number,
): RefundOutcome {
  const refunded = Math.min(amountRefundedCents, order.totalCents);
  if (refunded <= order.refundedCents) return "none";
  if (order.status === OrderStatus.PAID && refunded >= order.totalCents) return "cancel";
  return "record";
}

/**
 * Whether a closed dispute leaves the order's DISPUTED flag up. Won — the
 * money stays with the seller — clears it; lost, or anything Stripe adds
 * later, leaves it for the seller to see.
 */
export function disputeStillOpen(status: Stripe.Dispute.Status): boolean {
  return status !== "won" && status !== "warning_closed" && status !== "prevented";
}
