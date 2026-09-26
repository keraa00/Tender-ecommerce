import "server-only";

import type { CartDisplay } from "@/components/storefront/types";
import type { CartView } from "@/lib/cart/queries";
import { INTL_LOCALES, type Locale } from "@/lib/i18n/locales";
import { MESSAGES, plural } from "@/lib/i18n/messages";
import { formatMoney } from "@/lib/money";
import { storefrontPaths } from "./links";

/** Formats a cart for the client components, in the buyer's language. */
export function toCartDisplay(
  cart: CartView,
  storeSlug: string,
  locale: Locale,
): CartDisplay {
  const money = (cents: number) => formatMoney(cents, undefined, INTL_LOCALES[locale]);
  const paths = storefrontPaths(storeSlug);

  return {
    lines: cart.lines.map((line) => ({
      ...line,
      href: paths.product(line.productSlug),
      unitPrice: money(line.unitPriceCents),
      lineTotal: money(line.unitPriceCents * line.quantity),
    })),
    itemCount: cart.itemCount,
    itemCountLabel: plural(locale, cart.itemCount, MESSAGES[locale].cart.itemCount),
    subtotal: money(cart.subtotalCents),
  };
}
