import type { CustomerSegment } from "@/lib/db/types";
import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";

/**
 * Customer segments a discount can be limited to.
 *
 * There is no customers table (see `lib/customers/queries.ts`): a customer is
 * the email on their orders. So a segment is not a stored list but a rule over
 * that order history, answered at checkout from a `CustomerProfile`. That keeps
 * a segment correct without a write path — a buyer stops being "first-time" the
 * moment their first order settles, with nothing to update.
 *
 * Pure and dependency-free, so the form can show what each segment means and
 * the rules can be tested without a database.
 */

export type CustomerProfile = {
  /** Lower-cased. Null until the buyer has given one at checkout. */
  email: string | null;
  /** Signed in rather than checking out as a guest. */
  hasAccount: boolean;
  /** Paid or fulfilled orders at this store, not counting the current one. */
  settledOrders: number;
  lastOrderAt: Date | null;
};

/** A buyer nobody knows anything about yet. */
export const ANONYMOUS_CUSTOMER: CustomerProfile = {
  email: null,
  hasAccount: false,
  settledOrders: 0,
  lastOrderAt: null,
};

export const LOYAL_MIN_ORDERS = 3;
export const LAPSED_AFTER_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Each segment's rule. What a segment is called, and how it is explained, is
 * the admin's copy — `t.segments` — in the seller's language.
 */
const SEGMENTS: Record<
  CustomerSegment,
  (profile: CustomerProfile, now: Date) => boolean
> = {
  FIRST_TIME: (profile) => profile.settledOrders === 0,
  RETURNING: (profile) => profile.settledOrders >= 1,
  LOYAL: (profile) => profile.settledOrders >= LOYAL_MIN_ORDERS,
  LAPSED: (profile, now) =>
    profile.lastOrderAt !== null &&
    now.getTime() - profile.lastOrderAt.getTime() > LAPSED_AFTER_DAYS * DAY_MS,
  ACCOUNT_HOLDERS: (profile) => profile.hasAccount,
};

/** Every segment, in the order the discount form lists them. */
export const CUSTOMER_SEGMENTS: readonly CustomerSegment[] = [
  "FIRST_TIME",
  "RETURNING",
  "LOYAL",
  "LAPSED",
  "ACCOUNT_HOLDERS",
];

export function isCustomerSegment(value: unknown): value is CustomerSegment {
  return typeof value === "string" && Object.hasOwn(SEGMENTS, value);
}

/** A segment's hint, with the thresholds it names filled in. */
export function segmentHint(
  segment: CustomerSegment,
  t: AdminMessages["segments"],
): string {
  return format(t[segment].hint, { count: LOYAL_MIN_ORDERS, days: LAPSED_AFTER_DAYS });
}

/** True when the buyer is in at least one of the segments. */
export function matchesAnySegment(
  segments: readonly CustomerSegment[],
  profile: CustomerProfile,
  now: Date,
): boolean {
  return segments.some((segment) => SEGMENTS[segment](profile, now));
}
