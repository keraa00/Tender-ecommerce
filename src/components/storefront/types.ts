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
};

export type CartDisplay = {
  lines: CartLineDisplay[];
  itemCount: number;
  itemCountLabel: string;
  subtotal: string;
};

export type CartMessages = Messages["cart"];
