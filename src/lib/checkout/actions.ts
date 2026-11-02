"use server";

import { refresh } from "next/cache";

import { getCurrentUser } from "@/lib/auth/session";
import { getCart } from "@/lib/cart/queries";
import { readCartSessionId } from "@/lib/cart/session";
import { rootDb } from "@/lib/db/root";
import { CartKind } from "@/lib/db/types";
import { INTL_LOCALES } from "@/lib/i18n/locales";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { isUuid } from "@/lib/ids";
import { formatMoney } from "@/lib/money";
import { canAcceptOrders, isStorePubliclyVisible } from "@/lib/stores/policy";
import { getStoreBySlug } from "@/lib/stores/queries";
import { draftFromForm, savedDraft } from "./draft";
import { billingAddressRules, shippingAddressRules } from "./fields";
import { stripeBillingDetails, type StripeBillingDetails } from "@/lib/payments/rules";
import { normalizeEmail, parseCheckoutForm, type CheckoutFieldErrors } from "./form";
import { placeOrder, rememberPlacedOrder, type PlaceOrderError } from "./orders";
import { checkoutPaymentOptions, supersedePlacedOrder, type SupersedeResult } from "./payment";
import { forgetCheckout, rememberCheckout } from "./saved";

export type CheckoutState = {
  error?:
    | PlaceOrderError
    | "unavailable"
    /** An earlier payment from this browser is still clearing (a bank debit). */
    | "payment-processing";
  fieldErrors?: CheckoutFieldErrors;
  /** The new total, formatted, when the error is "total-changed". */
  total?: string;
};

/**
 * What placing an order hands the checkout form: the PaymentIntent to confirm
 * with the Payment Element, and the billing details the form collected, which
 * the Payment Element is told not to ask for again — or word that there is
 * nothing to pay online, so the form can show the order confirmed and move on
 * to the thank-you page itself.
 */
export type PlaceOrderResponse =
  | { ok: true; kind: "pay"; clientSecret: string; billingDetails: StripeBillingDetails }
  | { ok: true; kind: "done" }
  | ({ ok: false } & CheckoutState);

/**
 * The cart kind an action was bound to. Bound on the server, but it still
 * arrives through the browser, so it is checked like anything else — and it
 * only ever chooses between this browser's own carts.
 */
function cartKind(value: unknown): CartKind {
  return value === CartKind.BUY_NOW ? CartKind.BUY_NOW : CartKind.STANDARD;
}

/**
 * Keeps the checkout in progress on the cart — email, addresses, note,
 * opt-in, the rate picked — and re-renders the page, which re-prices it.
 * Posted as the buyer goes: when they leave the email field, finish an
 * address, pick a rate. So the summary always shows what the server makes of
 * what they have typed, and a refresh loses none of it.
 *
 * Nothing saved here is trusted later. The draft is read back as typing, and
 * the rate as a request; placing the order checks both again.
 */
export async function saveCheckoutAction(
  storeSlug: string,
  kind: CartKind,
  formData: FormData,
): Promise<void> {
  const store = await getStoreBySlug(storeSlug);
  const sessionId = await readCartSessionId();
  if (!store || !isStorePubliclyVisible(store) || !sessionId) return;

  const rawEmail = formData.get("email");
  const email = normalizeEmail(typeof rawEmail === "string" ? rawEmail : "");
  const rawRate = formData.get("shippingRateId");

  try {
    // Only a rate of this store's may be linked. Whether it applies to this
    // address and cart is the quote's call, on every render.
    const rate = isUuid(rawRate)
      ? await rootDb.shippingRate.findFirst({
          where: { id: rawRate, storeId: store.id },
          select: { id: true },
        })
      : null;

    // updateMany, scoped by (store, session, kind): only this browser's cart
    // in this store, and nothing at all when there is no cart.
    const draft = draftFromForm(formData);
    await rootDb.cart.updateMany({
      where: { storeId: store.id, sessionId, kind: cartKind(kind) },
      data: {
        ...(email ? { email } : {}),
        checkoutDraft: draft,
        shippingRateId: rate?.id ?? null,
      },
    });

    // Unticking "Save my information" forgets it now, not at the next order:
    // what someone on a shared computer expects. Ticking it saves nothing
    // until an order is placed.
    if (!draft.saveInfo) await forgetCheckout(store.id);
  } catch (error) {
    console.error("saveCheckoutAction failed", error);
    return;
  }

  refresh();
}

/**
 * Places the order and creates its PaymentIntent. Called from the checkout
 * form's submit handler — after the Payment Element has validated what the
 * buyer typed, before it confirms the payment — rather than as a form action,
 * because the form needs the client secret back, not a navigation.
 *
 * Answers "done" when there is nothing to pay online — an order that comes to
 * nothing, one paid in cash on delivery, or an earlier attempt that turns out
 * to have been paid already — and the form takes the buyer to the
 * confirmation page itself, once it has shown the order confirmed.
 */
export async function placeOrderAction(
  storeSlug: string,
  kind: CartKind,
  formData: FormData,
): Promise<PlaceOrderResponse> {
  const store = await getStoreBySlug(storeSlug);
  // Whether the chosen way of paying works — Stripe keys on this server, cash
  // on delivery for this order — is the quote's call, in `placeOrder`.
  if (!store || !isStorePubliclyVisible(store) || !canAcceptOrders(store)) {
    return { ok: false, error: "unavailable" };
  }

  const sessionId = await readCartSessionId();
  if (!sessionId) return { ok: false, error: "empty" };

  const cart = await getCart(store.id, cartKind(kind));
  const needsShipping = cart.lines.some((line) => line.available && line.requiresShipping);

  const parsed = parseCheckoutForm(formData, {
    needsShipping,
    shippingRules: shippingAddressRules(store),
    billingRules: billingAddressRules(store, needsShipping),
    orderNote: store.checkoutOrderNote,
    marketingOptIn: store.checkoutMarketingOptIn,
    codRequiresPhone: store.codRequirePhone,
  });
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  // Before pricing: cancelling an abandoned attempt gives its discount uses
  // back, and the new order is priced and redeemed against what is left.
  let superseded: SupersedeResult;
  try {
    superseded = await supersedePlacedOrder(store.id);
  } catch (error) {
    console.error("placeOrderAction: could not settle the previous attempt", error);
    return { ok: false, error: "payment-unavailable" };
  }
  if (superseded === "paid") return { ok: true, kind: "done" };
  if (superseded === "processing") return { ok: false, error: "payment-processing" };

  // A signed-in buyer's orders are linked to their account, which also counts
  // towards "signed-in customers" discounts and per-customer limits.
  const user = await getCurrentUser();

  const result = await placeOrder({
    store,
    payment: checkoutPaymentOptions(store),
    sessionId,
    kind: cartKind(kind),
    buyer: { email: parsed.details.email, userId: user?.id ?? null },
    details: parsed.details,
  });

  if (!result.ok) {
    // Re-render the page underneath so the summary shows what changed.
    refresh();
    if (result.error === "total-changed" && result.totalCents !== undefined) {
      const { locale } = await getStorefrontI18n();
      return {
        ok: false,
        error: "total-changed",
        total: formatMoney(result.totalCents, store.currency, INTL_LOCALES[locale]),
      };
    }
    return { ok: false, error: result.error };
  }

  await rememberPlacedOrder(store.slug, result.orderId);
  await keepCheckoutDetails(store.id, parsed.details.email, formData);
  if (!result.clientSecret) return { ok: true, kind: "done" };

  return {
    ok: true,
    kind: "pay",
    clientSecret: result.clientSecret,
    billingDetails: stripeBillingDetails(parsed.details.email, parsed.details.billingAddress),
  };
}

/**
 * "Save my information for next time", as the placed order left it: kept when
 * the box was ticked, forgotten when it was not. Only after the order is in,
 * so details that never made an order are never kept — and never at the cost
 * of the order, which has already been placed.
 */
async function keepCheckoutDetails(storeId: string, email: string, formData: FormData) {
  try {
    const draft = draftFromForm(formData);
    if (draft.saveInfo) await rememberCheckout(storeId, email, savedDraft(draft));
    else await forgetCheckout(storeId);
  } catch (error) {
    console.error("keepCheckoutDetails failed", error);
  }
}
