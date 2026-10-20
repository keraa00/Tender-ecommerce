import type { AddressRules } from "@/lib/address/validate";
import type { Store } from "@/lib/db/types";

/**
 * The checkout form's own fields, beyond the addresses, and their limits —
 * plus the store's checkout settings as the address rules they amount to.
 * Dependency-free, because the form component needs them and the parser
 * beside it imports zod.
 */

/** Also set as `maxLength` on the inputs, so the browser enforces it first. */
export const CHECKOUT_MAX_LENGTH = {
  email: 254,
  note: 500,
} as const;

/** Where the shipping and billing address fields are posted: `shipping.city`. */
export type AddressPrefix = "shipping" | "billing";

type CheckoutSettings = Pick<
  Store,
  "checkoutFirstName" | "checkoutCompany" | "checkoutAddress2" | "checkoutPhone"
>;

/**
 * The store's settings for the address it ships to. The phone is a contact
 * detail for delivery, so it is asked for once, with that address.
 */
export function shippingAddressRules(store: CheckoutSettings): AddressRules {
  return {
    firstName: store.checkoutFirstName,
    company: store.checkoutCompany,
    line2: store.checkoutAddress2,
    phone: store.checkoutPhone,
  };
}

/**
 * A separate billing address asks for the same as the shipping one, less the
 * phone. When nothing ships, the billing address is the only one, and asks for
 * the phone instead.
 */
export function billingAddressRules(store: CheckoutSettings, needsShipping: boolean): AddressRules {
  const rules = shippingAddressRules(store);
  return needsShipping ? { ...rules, phone: "HIDDEN" } : rules;
}
