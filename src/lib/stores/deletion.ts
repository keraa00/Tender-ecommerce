import { format, plural } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { Locale } from "@/lib/i18n/locales";

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

/** What stands in the way, in the seller's language. */
export function describeStoreDeletionBlocker(
  blocker: StoreDeletionBlocker,
  locale: Locale,
  t: AdminMessages["stores"]["deletionBlockers"],
): string {
  switch (blocker.kind) {
    case "paid-unfulfilled":
      return plural(locale, blocker.count, t.paidUnfulfilled);
    case "pending-cod":
      return plural(locale, blocker.count, t.pendingCod);
    case "payment-in-flight":
      return plural(locale, blocker.count, t.paymentInFlight);
  }
}

export type DeleteStoreField = "confirmSlug" | "currentPassword";

/**
 * Typing the slug is the "are you sure": unmistakably this store, and not
 * something a misclick produces. The current password is the "is it you", as
 * for deleting the account — a session left open on someone else's laptop
 * must not be enough to wipe a store. The caller checks it against Supabase.
 */
export function parseDeleteStoreForm(
  formData: FormData,
  storeSlug: string,
  t: AdminMessages["stores"]["errors"],
):
  | { ok: true; currentPassword: string }
  | { ok: false; fieldErrors: Partial<Record<DeleteStoreField, string>> } {
  const typed = formData.get("confirmSlug");
  const password = formData.get("currentPassword");

  const fieldErrors: Partial<Record<DeleteStoreField, string>> = {};
  if (typeof typed !== "string" || typed.trim().toLowerCase() !== storeSlug) {
    fieldErrors.confirmSlug = format(t.confirmSlug, { slug: storeSlug });
  }
  if (typeof password !== "string" || password.length === 0) {
    fieldErrors.currentPassword = t.passwordRequired;
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, currentPassword: password as string };
}
