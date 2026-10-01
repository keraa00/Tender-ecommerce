import type { CartLineView } from "@/lib/cart/queries";
import type { Messages } from "@/lib/i18n/messages";

/**
 * Shapes handed from the storefront's Server Components to its Client
 * Components. Money arrives already formatted: Node and the browser ship
 * different ICU data, and a price formatted twice can disagree with itself
 * ("US$" against "USD") and fail hydration.
 */

export type NavItem = { href: string; label: string; exact?: boolean };

export type CartLineDisplay = CartLineView & {
  href: string;
  unitPrice: string;
  lineTotal: string;
  /** The line after its share of the discounts; null when nothing came off. */
  discountedTotal: string | null;
};

export type CartDiscountDisplay = {
  id: string;
  /** The seller's title for it — theirs, so not translated. */
  title: string;
  code: string | null;
  /** A negative amount, or null for free shipping, which the summary words. */
  amount: string | null;
};

export type CartCodeDisplay = {
  code: string;
  applied: boolean;
  /** Why it is not applying, in the buyer's language. Null when it is. */
  message: string | null;
};

export type CartDisplay = {
  lines: CartLineDisplay[];
  itemCount: number;
  itemCountLabel: string;
  subtotal: string;
  discounts: CartDiscountDisplay[];
  total: string;
  /** The same total in cents, which checkout echoes back to catch a change. */
  totalCents: number;
  freeShipping: boolean;
  codes: CartCodeDisplay[];
};

export type CartMessages = Messages["cart"];
export type DiscountCodeMessages = Messages["discountCode"];
export type CheckoutMessages = Messages["checkout"];

/** One product in the header search's live results. */
export type SearchSuggestion = {
  id: string;
  title: string;
  href: string;
  image: { url: string; alt: string } | null;
  /** Null for a product with no options to buy. */
  price: string | null;
  /** The struck-through price, when there is a single price to compare. */
  compareAt: string | null;
  soldOut: boolean;
};

/** What `/s/<slug>/search/suggestions?q=` answers with. */
export type SearchSuggestions = {
  query: string;
  suggestions: SearchSuggestion[];
  /** Every match, not just those in `suggestions`. */
  total: number;
  /** `total` as a phrase in the buyer's language — "12 products". */
  totalLabel: string;
};

export type SearchMessages = Messages["search"];
