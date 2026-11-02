import { StoreMemberRole, StoreStatus, type Store, type StoreMember } from "@/lib/db/types";

/**
 * Pure predicates about a store's trading state and what its members may do.
 * Kept free of `server-only` and of any database access so they can be
 * unit-tested and reused on the client.
 */

type StripeFields = Pick<
  Store,
  "stripeAccountId" | "stripeOnboardingComplete" | "stripeChargesEnabled"
>;

type TradingFields = StripeFields & Pick<Store, "status" | "codEnabled">;

/**
 * The store's Stripe account can be charged: connected, onboarded, and with
 * charges enabled.
 *
 * `stripeAccountId` is checked explicitly rather than inferred from the flags:
 * a card payment needs an account to charge against, and a bad fixture or a
 * partial webhook must fail here rather than at the Stripe API boundary.
 */
export function stripeReady(store: StripeFields): boolean {
  return (
    store.stripeAccountId !== null && store.stripeOnboardingComplete && store.stripeChargesEnabled
  );
}

/**
 * A store may take orders once it is active and has a way to be paid: Stripe,
 * cash on delivery, or both. COD alone is enough — it is how a seller where
 * Stripe takes no merchants trades at all. Storefront browsing is allowed
 * earlier — a seller mid-setup should be able to see their own shop and share
 * it — but the buy button stays disabled with an explanation.
 */
export function canAcceptOrders(store: TradingFields): boolean {
  return store.status === StoreStatus.ACTIVE && (stripeReady(store) || store.codEnabled);
}

/** Why checkout is unavailable. A code, so the storefront can say it in the buyer's language. */
export type CheckoutBlock =
  | "suspended"
  | "payments-not-set-up"
  | "payments-on-hold"
  | "unavailable"
  | "no-shipping"
  /** The store takes cash on delivery only, and nothing in the cart is delivered. */
  | "cod-needs-shipping";

/**
 * Why this cart cannot be checked out, or null when it can. Payments come
 * first — no order can be taken without them — then shipping: a store that
 * delivers nowhere cannot sell anything that has to be delivered, but its
 * digital products and services still sell. Unless cash is the only way it is
 * paid: cash goes to a courier, and with nothing to deliver there is none.
 */
export function checkoutBlockedReason(
  store: TradingFields,
  cart: { requiresShipping: boolean; shipsAnywhere: boolean } = {
    requiresShipping: false,
    shipsAnywhere: true,
  },
): CheckoutBlock | null {
  if (!canAcceptOrders(store)) {
    if (store.status === StoreStatus.SUSPENDED) return "suspended";
    if (store.stripeAccountId === null || !store.stripeOnboardingComplete) {
      return "payments-not-set-up";
    }
    if (!store.stripeChargesEnabled) return "payments-on-hold";
    return "unavailable";
  }

  if (cart.requiresShipping && !cart.shipsAnywhere) return "no-shipping";
  if (!cart.requiresShipping && !stripeReady(store)) return "cod-needs-shipping";
  return null;
}

/**
 * A store's currency is fixed once it has taken an order, of any status.
 * Every order keeps its own currency, so nothing old would be relabelled —
 * but revenue, analytics and customer totals add amounts across orders, and a
 * sum of dollars and euros is not a number anyone should be shown.
 */
export function canChangeCurrency(store: { orderCount: number }): boolean {
  return store.orderCount === 0;
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

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/**
 * Who may connect the store to a Stripe account, or continue its onboarding.
 * The owner only: onboarding asks for the identity and bank details of the
 * person the money is paid to, and the account it creates is theirs.
 */
export function canManagePayments(membership: Membership): boolean {
  return membership.role === StoreMemberRole.OWNER;
}
