import type { CodeStatus } from "@/lib/checkout/totals";
import type { Locale } from "@/lib/i18n/locales";
import { format, plural, type Messages } from "@/lib/i18n/messages";

/**
 * What to tell a buyer about a code they entered, in their language. Null when
 * it applied — the summary line says that on its own.
 *
 * Deliberately coarse where detail would help someone probing codes rather than
 * using them: a switched-off code, a used-up one and a deleted one all read
 * "no longer available".
 */
export function codeStatusMessage(
  status: CodeStatus,
  t: Messages["discountCode"]["status"],
  locale: Locale,
  money: (cents: number) => string,
): string | null {
  if (status.state === "applied") return null;
  if (status.state === "unknown") return t.unavailable;

  const { rejection } = status;
  switch (rejection.reason) {
    case "disabled":
    case "usage-limit":
      return t.unavailable;
    case "expired":
      return t.expired;
    case "scheduled":
      return t.notActive;
    case "customer-required":
      return t.customerRequired;
    case "not-eligible":
      return t.notEligible;
    case "customer-limit":
      return t.alreadyUsed;
    case "no-matching-items":
      return t.noMatchingItems;
    case "minimum-subtotal":
      return format(t.spendMore, { amount: money(rejection.shortfallCents) });
    case "minimum-quantity":
    case "buy-quantity":
      return plural(locale, rejection.shortfall, t.addItems);
    case "reward-missing":
      return t.rewardMissing;
    case "not-combinable":
      return t.notCombinable;
  }
}
