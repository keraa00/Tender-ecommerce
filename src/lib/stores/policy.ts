import { StoreMemberRole, StoreStatus, type Store, type StoreMember } from "@/lib/db/types";

/**
 * Pure predicates about a store's trading state and what its members may do.
 * Kept free of `server-only` and of any database access so they can be
 * unit-tested and reused on the client.
 */

type TradingFields = Pick<
  Store,
  | "status"
  | "stripeAccountId"
  | "stripeOnboardingComplete"
  | "stripeChargesEnabled"
>;

/**
 * A store may take money only when all four hold. Storefront browsing is
 * allowed earlier — a seller mid-onboarding should be able to see their own
 * shop and share it — but the buy button stays disabled with an explanation.
 *
 * `stripeAccountId` is checked explicitly rather than inferred from the flags:
 * checkout needs an account to charge against, and a bad fixture or a partial
 * webhook must fail here rather than at the Stripe API boundary.
 */
export function canAcceptOrders(store: TradingFields): boolean {
  return (
    store.status === StoreStatus.ACTIVE &&
    store.stripeAccountId !== null &&
    store.stripeOnboardingComplete &&
    store.stripeChargesEnabled
  );
}

/** Why checkout is unavailable, for the storefront to explain to the buyer. */
export function checkoutBlockedReason(store: TradingFields): string | null {
  if (canAcceptOrders(store)) return null;

  if (store.status === StoreStatus.SUSPENDED) {
    return "This store is suspended and cannot take orders.";
  }
  if (store.stripeAccountId === null || !store.stripeOnboardingComplete) {
    return "This store hasn't finished setting up payments yet.";
  }
  if (!store.stripeChargesEnabled) {
    return "This store's payment provider has payments on hold.";
  }
  return "This store isn't accepting orders right now.";
}

/** Suspended stores are hidden from buyers entirely. */
export function isStorePubliclyVisible(store: Pick<Store, "status">): boolean {
  return store.status !== StoreStatus.SUSPENDED;
}

// ---------------------------------------------------------------------------
// Storefront design
// ---------------------------------------------------------------------------

type Membership = Pick<StoreMember, "role">;

/**
 * Who may change the storefront's design. Every member, for now — the same as
 * every other part of the admin, where staff edit products that go live the
 * moment they are saved. Named so the rule can tighten in one place.
 */
export function canEditTheme(membership: Membership): boolean {
  return membership.role === StoreMemberRole.OWNER || membership.role === StoreMemberRole.STAFF;
}

/**
 * Who may put a design in front of buyers. Every member, for now: see above.
 * This is the predicate to change to make publishing an owner's decision.
 */
export function canPublishTheme(membership: Membership): boolean {
  return membership.role === StoreMemberRole.OWNER || membership.role === StoreMemberRole.STAFF;
}
