/**
 * A postal address as an order stores it. Dependency-free, so the checkout
 * form, the seed and the admin can all share it.
 *
 * Structured rather than a block of text: shipping is priced from the country
 * and region, and a label printer or a carrier API will want the parts. The
 * country is an ISO 3166-1 alpha-2 code; its name is a display concern, put
 * into the reader's language where the address is shown.
 */
export type PostalAddress = {
  firstName: string | null;
  /** Always present: the one name a parcel cannot go without. */
  lastName: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  /**
   * The ISO 3166-2 subdivision code without the country prefix ("CA" for
   * California), when the country's regions are a fixed list. Null otherwise.
   */
  regionCode: string | null;
  /** The region as shown: the list's name for `regionCode`, or as typed. */
  region: string | null;
  postalCode: string | null;
  /** ISO 3166-1 alpha-2, upper-case. */
  countryCode: string;
  phone: string | null;
};

/** The parts shipping is priced from. */
export type ShippingDestination = {
  countryCode: string;
  regionCode: string | null;
};
