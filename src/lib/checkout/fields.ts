/**
 * The checkout form's fields and their length limits. Dependency-free, because
 * the form component needs them and the parser beside it imports zod.
 */

export type CheckoutField =
  | "email"
  | "name"
  | "address1"
  | "address2"
  | "city"
  | "region"
  | "postalCode"
  | "country";

/** Also set as `maxLength` on the inputs, so the browser enforces it first. */
export const CHECKOUT_MAX_LENGTH: Record<CheckoutField, number> = {
  email: 254,
  name: 120,
  address1: 200,
  address2: 200,
  city: 120,
  region: 120,
  postalCode: 20,
  country: 80,
};
