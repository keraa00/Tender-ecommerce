/**
 * What has to be settled before a store can be deleted, as pure rules shared by
 * the Settings page (which shows them) and `deleteStoreAction` (which enforces
 * them).
 *
 * Deleting a store deletes its orders: `orders.store_id` is `RESTRICT`, so they
 * go first, deliberately, in the same transaction. That is only acceptable once
 * no buyer is still owed something by an order — hence these blockers.
 */

export type StoreDeletionCounts = {
  /** Paid for and not yet sent. The buyer is owed a parcel or a refund. */
  paidUnfulfilled: number;
  /** Cash on delivery, placed and not yet marked paid or cancelled. */
  pendingCod: number;
  /**
   * Unpaid Stripe checkouts whose PaymentIntent could not be cancelled because
   * the money is already moving. Known only once cancelling has been tried.
   */
  paymentsInFlight: number;
};

export type StoreDeletionBlocker =
  | { kind: "paid-unfulfilled"; count: number }
  | { kind: "pending-cod"; count: number }
  | { kind: "payment-in-flight"; count: number };

export function storeDeletionBlockers(counts: StoreDeletionCounts): StoreDeletionBlocker[] {
  const blockers: StoreDeletionBlocker[] = [];
  if (counts.paidUnfulfilled > 0) {
    blockers.push({ kind: "paid-unfulfilled", count: counts.paidUnfulfilled });
  }
  if (counts.pendingCod > 0) {
    blockers.push({ kind: "pending-cod", count: counts.pendingCod });
  }
  if (counts.paymentsInFlight > 0) {
    blockers.push({ kind: "payment-in-flight", count: counts.paymentsInFlight });
  }
  return blockers;
}

function orders(count: number): string {
  return count === 1 ? "1 order" : `${count} orders`;
}

export function describeStoreDeletionBlocker(blocker: StoreDeletionBlocker): string {
  switch (blocker.kind) {
    case "paid-unfulfilled":
      return `${orders(blocker.count)} ${blocker.count === 1 ? "is" : "are"} paid for but not yet fulfilled. Fulfil or refund ${blocker.count === 1 ? "it" : "them"} first.`;
    case "pending-cod":
      return `${orders(blocker.count)} ${blocker.count === 1 ? "is" : "are"} waiting for cash on delivery. Mark ${blocker.count === 1 ? "it" : "them"} paid or cancel ${blocker.count === 1 ? "it" : "them"} first.`;
    case "payment-in-flight":
      return blocker.count === 1
        ? "A payment is still going through. Try again in a few minutes."
        : `${blocker.count} payments are still going through. Try again in a few minutes.`;
  }
}

export type DeleteStoreField = "confirmSlug";

/**
 * Typing the slug is the "are you sure": unmistakably this store, and not
 * something a misclick produces.
 */
export function parseDeleteStoreForm(
  formData: FormData,
  storeSlug: string,
): { ok: true } | { ok: false; fieldErrors: { confirmSlug: string } } {
  const typed = formData.get("confirmSlug");
  if (typeof typed === "string" && typed.trim().toLowerCase() === storeSlug) {
    return { ok: true };
  }
  return { ok: false, fieldErrors: { confirmSlug: `Type ${storeSlug} to confirm.` } };
}
