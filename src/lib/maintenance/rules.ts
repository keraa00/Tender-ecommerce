/**
 * How long each kind of leftover is kept before the daily sweep
 * (`/api/cron/sweep`) clears it, as pure functions for the tests. The privacy
 * page states these periods; change one, change the other.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Card orders the sweep resolves in one run. Each can cost two Stripe calls. */
export const UNPAID_ORDERS_PER_RUN = 40;

export type SweepCutoffs = {
  /** Card checkouts placed before this and still unpaid are resolved. */
  unpaidOrders: Date;
  /** Carts last written before this are deleted. */
  carts: Date;
  /** "Save my information" rows last saved before this are deleted. */
  savedCheckouts: Date;
  /** Theme-editor previews last updated before this are deleted. */
  themePreviews: Date;
  /** Processed-webhook records older than this are deleted. */
  webhookEvents: Date;
};

export function sweepCutoffs(now: Date): SweepCutoffs {
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
  return {
    // A day is far past any 3-D Secure challenge or bank redirect, and short
    // enough that a limited discount code is not held hostage for long.
    unpaidOrders: daysAgo(1),
    // The cart cookie lives 30 days from the last add to cart, which is what
    // `updatedAt` records; one more day means it has certainly expired.
    carts: daysAgo(31),
    // Likewise the saved-checkout cookie, a year from the last save.
    savedCheckouts: daysAgo(366),
    // A preview is rewritten on every edit; a day-old one has no editor open.
    themePreviews: daysAgo(1),
    // Stripe retries an undelivered event for up to three days. After that
    // the dedup record guards against nothing.
    webhookEvents: daysAgo(30),
  };
}
