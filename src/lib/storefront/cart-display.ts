import "server-only";

import type { CartDisplay } from "@/components/storefront/types";
import type { DiscountCodeError } from "@/lib/cart/actions";
import type { CartView } from "@/lib/cart/queries";
import { MAX_CART_CODES, type CartPricing } from "@/lib/checkout/totals";
import { INTL_LOCALES, type Locale } from "@/lib/i18n/locales";
import { MESSAGES, plural } from "@/lib/i18n/messages";
import { formatMoney } from "@/lib/money";
import { codeStatusMessage } from "./discount-messages";
import { storefrontPaths } from "./links";

/** The code box's errors, worded for the buyer's language ahead of time. */
export function discountCodeErrors(locale: Locale): Record<DiscountCodeError, string> {
  const { errors } = MESSAGES[locale].discountCode;
  return {
    "not-found": errors.notFound,
    "already-applied": errors.alreadyApplied,
    "too-many": plural(locale, MAX_CART_CODES, errors.tooMany),
    "empty-cart": errors.emptyCart,
    failed: errors.failed,
  };
}

/**
 * Formats a priced cart for the client components, in the buyer's language.
 * Savings are formatted as negative amounts rather than with a hand-placed
 * minus, so each locale puts its sign where it belongs.
 */
export function toCartDisplay(
  cart: CartView,
  pricing: CartPricing,
  store: { slug: string; currency: string },
  locale: Locale,
): CartDisplay {
  const money = (cents: number) => formatMoney(cents, store.currency, INTL_LOCALES[locale]);
  const paths = storefrontPaths(store.slug);
  const t = MESSAGES[locale];

  return {
    lines: cart.lines.map((line) => {
      const lineTotal = line.unitPriceCents * line.quantity;
      const discount = line.available ? (pricing.lineDiscounts[line.id] ?? 0) : 0;
      return {
        ...line,
        href: paths.product(line.productSlug),
        unitPrice: money(line.unitPriceCents),
        lineTotal: money(lineTotal),
        discountedTotal: discount > 0 ? money(lineTotal - discount) : null,
      };
    }),
    itemCount: cart.itemCount,
    itemCountLabel: plural(locale, cart.itemCount, t.cart.itemCount),
    subtotal: money(cart.subtotalCents),
    discounts: pricing.applied
      .filter((entry) => entry.amountCents > 0 || entry.freeShipping)
      .map((entry) => ({
        id: entry.discountId,
        title: entry.title,
        code: entry.code,
        amount: entry.amountCents > 0 ? money(-entry.amountCents) : null,
      })),
    paymentFee: pricing.paymentFeeCents > 0 ? money(pricing.paymentFeeCents) : null,
    total: money(pricing.totalCents),
    totalCents: pricing.totalCents,
    freeShipping: pricing.freeShipping,
    codes: pricing.codes.map((status) => ({
      code: status.code,
      applied: status.state === "applied",
      message: codeStatusMessage(status, t.discountCode.status, locale, money),
    })),
  };
}
