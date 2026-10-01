import type { CustomerSegment } from "@/lib/db/types";

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

const SEGMENTS: Record<
  CustomerSegment,
  {
    label: string;
    hint: string;
    matches: (profile: CustomerProfile, now: Date) => boolean;
  }
> = {
  FIRST_TIME: {
    label: "First-time customers",
    hint: "No paid orders at this store yet.",
    matches: (profile) => profile.settledOrders === 0,
  },
  RETURNING: {
    label: "Returning customers",
    hint: "At least one paid order before.",
    matches: (profile) => profile.settledOrders >= 1,
  },
  LOYAL: {
    label: "Loyal customers",
    hint: `${LOYAL_MIN_ORDERS} or more paid orders.`,
    matches: (profile) => profile.settledOrders >= LOYAL_MIN_ORDERS,
  },
  LAPSED: {
    label: "Lapsed customers",
    hint: `Ordered before, but not in the last ${LAPSED_AFTER_DAYS} days.`,
    matches: (profile, now) =>
      profile.lastOrderAt !== null &&
      now.getTime() - profile.lastOrderAt.getTime() > LAPSED_AFTER_DAYS * DAY_MS,
  },
  ACCOUNT_HOLDERS: {
    label: "Signed-in customers",
    hint: "Checking out with an account, not as a guest.",
    matches: (profile) => profile.hasAccount,
  },
};

export const CUSTOMER_SEGMENT_OPTIONS: readonly {
  value: CustomerSegment;
  label: string;
  hint: string;
}[] = (
  ["FIRST_TIME", "RETURNING", "LOYAL", "LAPSED", "ACCOUNT_HOLDERS"] as const
).map((value) => ({ value, label: SEGMENTS[value].label, hint: SEGMENTS[value].hint }));

export function isCustomerSegment(value: unknown): value is CustomerSegment {
  return typeof value === "string" && Object.hasOwn(SEGMENTS, value);
}

export function segmentLabel(segment: CustomerSegment): string {
  return SEGMENTS[segment].label;
}

/** True when the buyer is in at least one of the segments. */
export function matchesAnySegment(
  segments: readonly CustomerSegment[],
  profile: CustomerProfile,
  now: Date,
): boolean {
  return segments.some((segment) => SEGMENTS[segment].matches(profile, now));
}
