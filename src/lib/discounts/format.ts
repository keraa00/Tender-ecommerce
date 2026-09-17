import { DiscountType, type Discount } from "@/lib/db/types";
import { formatMoney } from "@/lib/money";

/**
 * Pure presentation of a discount. No database access and no `server-only`, so
 * the rules a seller sees are unit-testable and the same on both sides of the
 * wire.
 */

type ValueFields = Pick<Discount, "type" | "value">;

/**
 * `value` means something different per type — see the note on the model. A
 * percentage is stored in basis points, so 1000 is 10%, and printing it raw is
 * how a 10% promotion is announced as 1000% off.
 */
export function formatDiscountValue(discount: ValueFields): string {
  switch (discount.type) {
    case DiscountType.PERCENTAGE: {
      // Trim the decimals when they are zero: "10% off", not "10.00% off".
      const percent = discount.value / 100;
      const text = Number.isInteger(percent)
        ? String(percent)
        : percent.toFixed(2).replace(/0+$/, "");
      return `${text}% off`;
    }
    case DiscountType.FIXED_AMOUNT:
      return `${formatMoney(discount.value)} off`;
    case DiscountType.FREE_SHIPPING:
      return "Free shipping";
  }
}

export type DiscountState =
  | "active"
  | "scheduled"
  | "expired"
  | "exhausted"
  | "disabled";

type StateFields = Pick<
  Discount,
  "active" | "startsAt" | "endsAt" | "usageLimit" | "usageCount"
>;

/**
 * Why a discount is or is not currently applying.
 *
 * Ordered most-deliberate first: a seller who switched a discount off wants to
 * be told that, not that it also happens to have expired last week. Dates beat
 * the usage limit for the same reason — a closed window is the fact that will
 * not change on its own.
 */
export function discountState(
  discount: StateFields,
  now: Date = new Date(),
): DiscountState {
  if (!discount.active) return "disabled";
  if (discount.startsAt && now < discount.startsAt) return "scheduled";
  if (discount.endsAt && now > discount.endsAt) return "expired";
  if (
    discount.usageLimit !== null &&
    discount.usageCount >= discount.usageLimit
  ) {
    return "exhausted";
  }
  return "active";
}

export const DISCOUNT_STATE_LABELS: Record<DiscountState, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  exhausted: "Limit reached",
  disabled: "Off",
};
