import { CodFeeType, PaymentMethod, type Store } from "@/lib/db/types";

/**
 * Cash on delivery: the buyer pays the courier when the parcel arrives. The
 * pure half — what a store offers, what it costs, whether this order may use
 * it, and which way an order is paid when a store offers both. No
 * `server-only`, no database, so the rules are tested directly and the
 * checkout form can share the types.
 *
 * A COD order is real from the moment it is placed: there is no payment to
 * wait for, so stock is taken and the cart emptied then, and the order stays
 * PENDING until the seller marks the cash received (`src/lib/payments/settle.ts`).
 */

/** How the checkout form names the two ways to pay. */
export type PaymentChoice = "stripe" | "cod";

/** Reads a posted or saved choice; anything else is no choice. */
export function readPaymentChoice(value: unknown): PaymentChoice | null {
  return value === "stripe" || value === "cod" ? value : null;
}

export function paymentMethodOf(choice: PaymentChoice): PaymentMethod {
  return choice === "cod" ? PaymentMethod.CASH_ON_DELIVERY : PaymentMethod.STRIPE;
}

export type CodSettings = {
  enabled: boolean;
  /** The seller's name for it; null for "Cash on delivery" in the buyer's language. */
  label: string | null;
  instructions: string | null;
  feeType: CodFeeType;
  /** Cents, or basis points of the order total. */
  feeValue: number;
  minTotalCents: number | null;
  maxTotalCents: number | null;
  /** Empty: wherever the store ships. */
  countryCodes: readonly string[];
  requirePhone: boolean;
};

type CodColumns = Pick<
  Store,
  | "codEnabled"
  | "codLabel"
  | "codInstructions"
  | "codFeeType"
  | "codFeeValue"
  | "codMinTotalCents"
  | "codMaxTotalCents"
  | "codCountryCodes"
  | "codRequirePhone"
>;

export function codSettingsOf(store: CodColumns): CodSettings {
  return {
    enabled: store.codEnabled,
    label: store.codLabel,
    instructions: store.codInstructions,
    feeType: store.codFeeType,
    feeValue: store.codFeeValue,
    minTotalCents: store.codMinTotalCents,
    maxTotalCents: store.codMaxTotalCents,
    countryCodes: store.codCountryCodes,
    requirePhone: store.codRequirePhone,
  };
}

/**
 * The fee for an order whose total, before the fee, is `baseCents` — products
 * and shipping, after discounts: what the buyer would otherwise pay. A
 * percentage rounds half-up to the cent, like the platform's commission.
 * Nothing to pay means nothing to charge for collecting it.
 */
export function codFeeCents(
  settings: Pick<CodSettings, "feeType" | "feeValue">,
  baseCents: number,
): number {
  if (baseCents <= 0) return 0;
  if (settings.feeType === CodFeeType.PERCENTAGE) {
    return Math.round((baseCents * settings.feeValue) / 10_000);
  }
  return settings.feeValue;
}

/** Why COD is not offered on this order. A code, so the storefront can word it. */
export type CodUnavailableReason =
  | "disabled"
  /** Nothing in the cart ships, so there is no courier to pay. */
  | "no-shipping"
  /** Not offered for the country the order ships to. */
  | "country"
  | "below-minimum"
  | "above-maximum";

export type CodAvailability =
  | { available: true; feeCents: number }
  | { available: false; reason: CodUnavailableReason };

/**
 * Whether this order may be paid in cash on delivery, and what that adds.
 * The limits are judged on the same total the fee is, before the fee — a
 * seller's "up to 500" means 500 of goods and shipping. A country limit with
 * no country yet is not met: the address decides.
 */
export function codAvailability(
  settings: CodSettings,
  order: { baseCents: number; needsShipping: boolean; countryCode: string | null },
): CodAvailability {
  if (!settings.enabled) return { available: false, reason: "disabled" };
  if (!order.needsShipping) return { available: false, reason: "no-shipping" };
  if (
    settings.countryCodes.length > 0 &&
    (order.countryCode === null || !settings.countryCodes.includes(order.countryCode))
  ) {
    return { available: false, reason: "country" };
  }
  if (settings.minTotalCents !== null && order.baseCents < settings.minTotalCents) {
    return { available: false, reason: "below-minimum" };
  }
  if (settings.maxTotalCents !== null && order.baseCents > settings.maxTotalCents) {
    return { available: false, reason: "above-maximum" };
  }
  return { available: true, feeCents: codFeeCents(settings, order.baseCents) };
}

/**
 * How the order will be paid: the buyer's pick when it can be used, else
 * whichever can — the card first, as the option most buyers expect — else
 * nothing. Like a shipping rate, the pick is only a request; placing the
 * order refuses one that was swapped for another here.
 */
export function choosePaymentMethod(options: {
  stripe: boolean;
  cod: boolean;
  requested: PaymentChoice | null;
}): PaymentChoice | null {
  if (options.requested === "cod" && options.cod) return "cod";
  if (options.requested === "stripe" && options.stripe) return "stripe";
  if (options.stripe) return "stripe";
  if (options.cod) return "cod";
  return null;
}
