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

/** A country in a select, named in the buyer's language on the server. */
export type CountryOptionDisplay = { code: string; name: string };

export type ShippingRateDisplay = {
  id: string;
  /** The seller's name for it — theirs, so not translated. */
  name: string;
  /** Formatted, or the word for free. */
  price: string;
  /** "2–4 business days", or null when the seller gave none. */
  estimate: string | null;
};

/** What checkout knows about shipping, ready to show. */
export type CheckoutShippingDisplay = {
  state: "not-required" | "address-needed" | "not-shipped" | "no-rates" | "ready";
  /** Cheapest first; empty unless `state` is "ready". */
  rates: ShippingRateDisplay[];
  selectedId: string | null;
  /** The summary's shipping line, or null when nothing ships. */
  summary: { value: string; struck: string | null } | null;
};

/**
 * How the buyer pays: Stripe's Payment Element, acting as the store's own
 * connected account — charges are direct, so Stripe.js has to load as the
 * seller to confirm a PaymentIntent that lives on their account. No client
 * secret here: the PaymentIntent is created when the order is placed, and the
 * amount the Element shows wallets is the cart's total, which re-pricing keeps
 * current.
 */
export type PaymentProviderDisplay = {
  kind: "stripe";
  publishableKey: string;
  stripeAccountId: string;
  /** Lower-case ISO 4217, as Stripe.js wants it. */
  currency: string;
  /** The storefront language as a Stripe Elements locale. */
  locale: string;
  /** The store's accent, for the Payment Element's primary colour. */
  accentColor: string | null;
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
