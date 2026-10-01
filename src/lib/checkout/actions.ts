"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";

import { getCurrentUser } from "@/lib/auth/session";
import { readCartSessionId } from "@/lib/cart/session";
import { rootDb } from "@/lib/db/root";
import { INTL_LOCALES } from "@/lib/i18n/locales";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { storefrontPaths } from "@/lib/storefront/links";
import { canAcceptOrders, isStorePubliclyVisible } from "@/lib/stores/policy";
import { getStoreBySlug } from "@/lib/stores/queries";
import { normalizeEmail, parseCheckoutForm, type CheckoutFieldErrors } from "./form";
import { placeOrder, rememberPlacedOrder, type PlaceOrderError } from "./orders";

export type CheckoutState = {
  error?: PlaceOrderError | "unavailable";
  fieldErrors?: CheckoutFieldErrors;
  /** The new total, formatted, when the error is "total-changed". */
  total?: string;
};

/**
 * Keeps the checkout email on the cart as soon as the buyer leaves the field,
 * so the summary re-prices for them — a first-order code starts applying, a
 * customer-only offer appears — before they press "Place order".
 */
export async function setCheckoutEmailAction(
  storeSlug: string,
  formData: FormData,
): Promise<void> {
  const store = await getStoreBySlug(storeSlug);
  const sessionId = await readCartSessionId();
  const raw = formData.get("email");
  const email = normalizeEmail(typeof raw === "string" ? raw : "");
  if (!store || !isStorePubliclyVisible(store) || !sessionId || !email) return;

  try {
    // updateMany, scoped by (store, session): only this browser's cart in this
    // store, and nothing at all when there is no cart.
    await rootDb.cart.updateMany({
      where: { storeId: store.id, sessionId },
      data: { email },
    });
  } catch (error) {
    console.error("setCheckoutEmailAction failed", error);
    return;
  }

  refresh();
}

export async function placeOrderAction(
  storeSlug: string,
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const store = await getStoreBySlug(storeSlug);
  if (!store || !isStorePubliclyVisible(store) || !canAcceptOrders(store)) {
    return { error: "unavailable" };
  }

  const parsed = parseCheckoutForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const sessionId = await readCartSessionId();
  if (!sessionId) return { error: "empty" };

  // A signed-in buyer's orders are linked to their account, which also counts
  // towards "signed-in customers" discounts and per-customer limits.
  const user = await getCurrentUser();

  const result = await placeOrder({
    store,
    sessionId,
    buyer: { email: parsed.details.email, userId: user?.id ?? null },
    address: parsed.details.address,
    expectedTotalCents: parsed.details.expectedTotalCents,
  });

  if (!result.ok) {
    // Re-render the page underneath so the summary shows what changed.
    refresh();
    if (result.error === "total-changed" && result.totalCents !== undefined) {
      const { locale } = await getStorefrontI18n();
      return {
        error: "total-changed",
        total: formatMoney(result.totalCents, undefined, INTL_LOCALES[locale]),
      };
    }
    return { error: result.error };
  }

  await rememberPlacedOrder(store.slug, result.orderId);
  // Outside any try block: redirect() signals by throwing.
  redirect(storefrontPaths(store.slug).checkoutComplete);
}
