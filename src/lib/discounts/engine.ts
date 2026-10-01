import type {
  CustomerSegment,
  DiscountAppliesTo,
  DiscountEligibility,
  DiscountType,
} from "@/lib/db/types";
import { FULL_DISCOUNT_BPS } from "./constants";
import { discountState } from "./format";
import { matchesAnySegment, type CustomerProfile } from "./segments";

/**
 * The discount engine: given a cart, a buyer and the discounts on offer, which
 * apply and for how much.
 *
 * Pure — no database, no clock, no cookies. Checkout loads the rules and the
 * buyer's history (`queries.ts`), calls `applyDiscounts`, and records what was
 * used inside the order transaction (`redemption.ts`), which re-checks the
 * usage limits under a lock. Everything that decides an amount lives here, so
 * every rule is covered by `tests/discount-engine.test.ts`.
 *
 * Money is integer cents throughout. Where an amount is split across lines the
 * split is exact — the per-line figures always sum to the total — because they
 * become order-line snapshots and, later, refund amounts.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type DiscountScope = {
  appliesTo: DiscountAppliesTo;
  productIds: readonly string[];
  collectionIds: readonly string[];
};

/** A discount as the engine sees it — the row plus its link tables, flattened. */
export type DiscountRule = {
  id: string;
  code: string | null;
  title: string;
  type: DiscountType;
  value: number;
  /** What the discount reduces. For BUY_X_GET_Y, what the buyer gets. */
  discounted: DiscountScope;
  /** BUY_X_GET_Y only: what the buyer has to buy. */
  qualifying: DiscountScope | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  maxUsesPerOrder: number | null;
  minSubtotalCents: number | null;
  minQuantity: number | null;
  eligibility: DiscountEligibility;
  segments: readonly CustomerSegment[];
  /** Lower-cased. */
  customerEmails: readonly string[];
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  combinable: boolean;
  startsAt: Date;
  endsAt: Date | null;
  active: boolean;
};

export type PricedLine = {
  id: string;
  productId: string;
  collectionIds: readonly string[];
  unitPriceCents: number;
  quantity: number;
};

export type PricingContext = {
  /** Only lines that can actually be bought — see `cartTotals`. */
  lines: readonly PricedLine[];
  /** Zero until checkout knows the address; free shipping saves nothing yet. */
  shippingCents: number;
  customer: CustomerProfile;
  /** How often this buyer has already used each discount, by discount id. */
  customerRedemptions: ReadonlyMap<string, number>;
  now: Date;
};

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type DiscountRejection =
  | { reason: "disabled" }
  | { reason: "scheduled"; startsAt: Date }
  | { reason: "expired" }
  | { reason: "usage-limit" }
  /** Eligibility or a per-customer limit needs to know who is buying. */
  | { reason: "customer-required" }
  | { reason: "not-eligible" }
  | { reason: "customer-limit" }
  | { reason: "no-matching-items" }
  | { reason: "minimum-subtotal"; shortfallCents: number }
  | { reason: "minimum-quantity"; shortfall: number }
  | { reason: "buy-quantity"; shortfall: number }
  /** The buy side is met, but nothing the buyer would get is in the cart. */
  | { reason: "reward-missing" }
  /** Applies on its own, but a better or non-stacking discount won. */
  | { reason: "not-combinable" };

export type LineAllocation = { lineId: string; amountCents: number };

export type AppliedDiscount = {
  discountId: string;
  code: string | null;
  title: string;
  type: DiscountType;
  /** Taken off the items; always equals the sum of `allocations`. */
  amountCents: number;
  allocations: LineAllocation[];
  /** Taken off shipping. */
  shippingCents: number;
  freeShipping: boolean;
};

export type DiscountOutcome =
  | { ok: true; applied: AppliedDiscount }
  | { ok: false; rejection: DiscountRejection };

export type DiscountSelection = {
  applied: AppliedDiscount[];
  itemsDiscountCents: number;
  shippingDiscountCents: number;
  /** Why each rule that did not make it in was left out, by discount id. */
  rejected: Map<string, DiscountRejection>;
};

// ---------------------------------------------------------------------------
// Conditions that do not depend on the cart
// ---------------------------------------------------------------------------

/**
 * Status, schedule, overall limit, who the buyer is, and their own limit. Null
 * when the rule may go on to be priced.
 */
export function checkConditions(
  rule: DiscountRule,
  context: Pick<PricingContext, "customer" | "customerRedemptions" | "now">,
): DiscountRejection | null {
  const state = discountState(rule, context.now);
  if (state === "disabled") return { reason: "disabled" };
  if (state === "scheduled") return { reason: "scheduled", startsAt: rule.startsAt };
  if (state === "expired") return { reason: "expired" };
  if (state === "exhausted") return { reason: "usage-limit" };

  const { customer } = context;
  const needsIdentity = rule.eligibility !== "ALL" || rule.perCustomerLimit !== null;
  if (needsIdentity && customer.email === null) return { reason: "customer-required" };

  if (rule.eligibility === "SEGMENTS" && !matchesAnySegment(rule.segments, customer, context.now)) {
    return { reason: "not-eligible" };
  }
  if (
    rule.eligibility === "CUSTOMERS" &&
    !rule.customerEmails.includes(customer.email?.toLowerCase() ?? "")
  ) {
    return { reason: "not-eligible" };
  }

  if (rule.perCustomerLimit !== null) {
    const used = context.customerRedemptions.get(rule.id) ?? 0;
    if (used >= rule.perCustomerLimit) return { reason: "customer-limit" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export function inScope(scope: DiscountScope, line: PricedLine): boolean {
  switch (scope.appliesTo) {
    case "ALL":
      return true;
    case "PRODUCT":
      return scope.productIds.includes(line.productId);
    case "COLLECTION":
      return line.collectionIds.some((id) => scope.collectionIds.includes(id));
  }
}

/** a × bps / 10 000, rounded half-up. Exact: the product stays an integer. */
function applyBps(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / FULL_DISCOUNT_BPS);
}

/**
 * Splits `amountCents` across lines in proportion to their weights, exactly:
 * whole cents by floor division, then the leftover cents one each to the lines
 * with the largest remainders (earlier lines winning ties). No line receives
 * more than its weight while `amountCents` does not exceed the total weight.
 *
 * BigInt because cents × cents overflows a double's exact range long before a
 * cart gets unrealistic.
 */
export function allocateProportionally(
  amountCents: number,
  weights: readonly { lineId: string; weight: number }[],
): LineAllocation[] {
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (amountCents <= 0 || total <= 0) return [];

  const amount = BigInt(amountCents);
  const divisor = BigInt(total);

  const shares = weights.map((entry, index) => {
    const numerator = amount * BigInt(entry.weight);
    return {
      lineId: entry.lineId,
      index,
      cents: Number(numerator / divisor),
      remainder: numerator % divisor,
    };
  });

  let leftover = amountCents - shares.reduce((sum, share) => sum + share.cents, 0);
  const byRemainder = [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const share of byRemainder) {
    if (leftover === 0) break;
    share.cents += 1;
    leftover -= 1;
  }

  return shares
    .filter((share) => share.cents > 0)
    .map((share) => ({ lineId: share.lineId, amountCents: share.cents }));
}

/**
 * What is left to discount as a stack is applied: per line, and per unit for
 * the units a buy-X-get-Y has already used, which a second one may not reuse.
 */
type PricingState = {
  remaining: Map<string, number>;
  consumedUnits: Map<string, number>;
  shippingRemaining: number;
};

function freshState(context: PricingContext): PricingState {
  return {
    remaining: new Map(
      context.lines.map((line) => [line.id, line.unitPriceCents * line.quantity]),
    ),
    consumedUnits: new Map(),
    shippingRemaining: context.shippingCents,
  };
}

function priceRule(
  rule: DiscountRule,
  context: PricingContext,
  state: PricingState,
): DiscountOutcome {
  const base = {
    discountId: rule.id,
    code: rule.code,
    title: rule.title,
    type: rule.type,
  };

  if (rule.type === "BUY_X_GET_Y") return priceBuyXGetY(rule, context, state, base);

  // Minimums are measured over the items the discount covers, at their listed
  // prices — "$20 off outerwear over $150" means $150 of outerwear, however
  // another discount in the stack has already reduced it.
  const eligible = context.lines.filter((line) => inScope(rule.discounted, line));
  if (eligible.length === 0) return { ok: false, rejection: { reason: "no-matching-items" } };

  const listedSubtotal = eligible.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );
  const quantity = eligible.reduce((sum, line) => sum + line.quantity, 0);

  if (rule.minSubtotalCents !== null && listedSubtotal < rule.minSubtotalCents) {
    return {
      ok: false,
      rejection: {
        reason: "minimum-subtotal",
        shortfallCents: rule.minSubtotalCents - listedSubtotal,
      },
    };
  }
  if (rule.minQuantity !== null && quantity < rule.minQuantity) {
    return {
      ok: false,
      rejection: { reason: "minimum-quantity", shortfall: rule.minQuantity - quantity },
    };
  }

  if (rule.type === "FREE_SHIPPING") {
    const shippingCents = state.shippingRemaining;
    state.shippingRemaining = 0;
    return {
      ok: true,
      applied: { ...base, amountCents: 0, allocations: [], shippingCents, freeShipping: true },
    };
  }

  const weights = eligible.map((line) => ({
    lineId: line.id,
    weight: state.remaining.get(line.id) ?? 0,
  }));
  const remainingTotal = weights.reduce((sum, entry) => sum + entry.weight, 0);

  const amountCents =
    rule.type === "PERCENTAGE"
      ? applyBps(remainingTotal, rule.value)
      : Math.min(rule.value, remainingTotal);

  const allocations = allocateProportionally(amountCents, weights);
  for (const allocation of allocations) {
    state.remaining.set(
      allocation.lineId,
      (state.remaining.get(allocation.lineId) ?? 0) - allocation.amountCents,
    );
  }

  return {
    ok: true,
    applied: { ...base, amountCents, allocations, shippingCents: 0, freeShipping: false },
  };
}

type Unit = {
  lineId: string;
  priceCents: number;
  qualifies: boolean;
  rewardable: boolean;
};

/**
 * Buy X, get Y. Each application sets aside X qualifying units and discounts up
 * to Y rewardable ones, and no unit plays both parts or counts twice.
 *
 * Greedy, the way sellers expect: the buyer pays for the dearest qualifying
 * units and the discount lands on the cheapest rewardable ones. Qualifying
 * units that could not be rewards are used up first, so "buy any 2, get a mug
 * free" spends the shirts on the buy side and keeps the mug for the reward.
 * The last application may give fewer than Y if that is all the cart holds.
 */
function priceBuyXGetY(
  rule: DiscountRule,
  context: PricingContext,
  state: PricingState,
  base: Pick<AppliedDiscount, "discountId" | "code" | "title" | "type">,
): DiscountOutcome {
  const buyQuantity = rule.buyQuantity ?? 1;
  const getQuantity = rule.getQuantity ?? 1;
  const qualifyingScope = rule.qualifying ?? { appliesTo: "ALL", productIds: [], collectionIds: [] };

  const units: Unit[] = [];
  for (const line of context.lines) {
    const qualifies = inScope(qualifyingScope, line);
    const rewardable = inScope(rule.discounted, line);
    if (!qualifies && !rewardable) continue;

    const free = line.quantity - (state.consumedUnits.get(line.id) ?? 0);
    for (let i = 0; i < free; i += 1) {
      units.push({ lineId: line.id, priceCents: line.unitPriceCents, qualifies, rewardable });
    }
  }

  const qualifyingCount = units.filter((unit) => unit.qualifies).length;
  if (qualifyingCount < buyQuantity) {
    return {
      ok: false,
      rejection: { reason: "buy-quantity", shortfall: buyQuantity - qualifyingCount },
    };
  }

  // Stable sorts on a list already in cart order, so equal prices resolve the
  // same way every time.
  const buyOrder = units
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => unit.qualifies)
    .sort(
      (a, b) =>
        Number(a.unit.rewardable) - Number(b.unit.rewardable) ||
        b.unit.priceCents - a.unit.priceCents ||
        a.index - b.index,
    );
  const rewardOrder = units
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => unit.rewardable)
    .sort((a, b) => a.unit.priceCents - b.unit.priceCents || a.index - b.index);

  const used = new Set<number>();
  const perLine = new Map<string, number>();
  const consumed = new Map<string, number>();
  const limit = rule.maxUsesPerOrder ?? Number.POSITIVE_INFINITY;
  let applications = 0;

  while (applications < limit) {
    const buys = buyOrder.filter(({ index }) => !used.has(index)).slice(0, buyQuantity);
    if (buys.length < buyQuantity) break;

    const buyIndexes = new Set(buys.map(({ index }) => index));
    const gets = rewardOrder
      .filter(({ index }) => !used.has(index) && !buyIndexes.has(index))
      .slice(0, getQuantity);
    if (gets.length === 0) break;

    for (const { index, unit } of [...buys, ...gets]) {
      used.add(index);
      consumed.set(unit.lineId, (consumed.get(unit.lineId) ?? 0) + 1);
    }
    for (const { unit } of gets) {
      perLine.set(unit.lineId, (perLine.get(unit.lineId) ?? 0) + applyBps(unit.priceCents, rule.value));
    }

    applications += 1;
    if (gets.length < getQuantity) break;
  }

  if (applications === 0) return { ok: false, rejection: { reason: "reward-missing" } };

  // Keep cart order, and never take a line below zero — a unit reduced by an
  // earlier stacked discount has less left than its listed price.
  const allocations: LineAllocation[] = [];
  for (const line of context.lines) {
    const wanted = perLine.get(line.id);
    if (!wanted) continue;
    const available = state.remaining.get(line.id) ?? 0;
    const amountCents = Math.min(wanted, available);
    if (amountCents <= 0) continue;
    allocations.push({ lineId: line.id, amountCents });
    state.remaining.set(line.id, available - amountCents);
  }
  for (const [lineId, count] of consumed) {
    state.consumedUnits.set(lineId, (state.consumedUnits.get(lineId) ?? 0) + count);
  }

  const amountCents = allocations.reduce((sum, entry) => sum + entry.amountCents, 0);
  return {
    ok: true,
    applied: { ...base, amountCents, allocations, shippingCents: 0, freeShipping: false },
  };
}

// ---------------------------------------------------------------------------
// One discount on its own
// ---------------------------------------------------------------------------

/** Whether a single discount applies to this cart and buyer, and for how much. */
export function evaluateDiscount(rule: DiscountRule, context: PricingContext): DiscountOutcome {
  const rejection = checkConditions(rule, context);
  if (rejection) return { ok: false, rejection };
  return priceRule(rule, context, freshState(context));
}

// ---------------------------------------------------------------------------
// Choosing what applies together
// ---------------------------------------------------------------------------

/**
 * The order a stack is applied in. Item discounts that pick particular units
 * go first, while every unit is still at its listed price; then percentages,
 * so a fixed amount comes off what is left rather than being multiplied down;
 * shipping last. Ties go to the older discount, then the id, so the same cart
 * always prices the same way.
 */
const APPLICATION_ORDER: Record<DiscountType, number> = {
  BUY_X_GET_Y: 0,
  PERCENTAGE: 1,
  FIXED_AMOUNT: 2,
  FREE_SHIPPING: 3,
};

function byApplicationOrder(a: DiscountRule, b: DiscountRule): number {
  return (
    APPLICATION_ORDER[a.type] - APPLICATION_ORDER[b.type] ||
    a.startsAt.getTime() - b.startsAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function priceStack(
  rules: readonly DiscountRule[],
  context: PricingContext,
): { applied: AppliedDiscount[]; savings: number } {
  const state = freshState(context);
  const applied: AppliedDiscount[] = [];

  for (const rule of [...rules].sort(byApplicationOrder)) {
    const outcome = priceRule(rule, context, state);
    if (outcome.ok) applied.push(outcome.applied);
  }

  const savings = applied.reduce(
    (sum, entry) => sum + entry.amountCents + entry.shippingCents,
    0,
  );
  return { applied, savings };
}

/**
 * Picks what applies to an order from every discount on offer: the automatic
 * ones plus whatever codes the buyer entered.
 *
 * A discount that cannot be combined only ever applies alone, so the choice is
 * between each of those on its own and all the combinable ones stacked. The
 * buyer gets whichever saves the most. On a tie the option using more of the
 * buyer's own codes wins — they typed it, so it should be the one they see —
 * then the one with fewer discounts, for the simpler receipt.
 */
export function applyDiscounts(
  rules: readonly DiscountRule[],
  context: PricingContext,
): DiscountSelection {
  const rejected = new Map<string, DiscountRejection>();
  const applicable: DiscountRule[] = [];

  for (const rule of rules) {
    const outcome = evaluateDiscount(rule, context);
    if (outcome.ok) applicable.push(rule);
    else rejected.set(rule.id, outcome.rejection);
  }

  const options: DiscountRule[][] = applicable
    .filter((rule) => !rule.combinable)
    .map((rule) => [rule]);
  const stackable = applicable.filter((rule) => rule.combinable);
  if (stackable.length > 0) options.push(stackable);

  let best: { applied: AppliedDiscount[]; savings: number; codes: number } | null = null;

  for (const option of options) {
    const priced = priceStack(option, context);
    const codes = priced.applied.filter((entry) => entry.code !== null).length;
    const candidate = { ...priced, codes };

    if (
      best === null ||
      candidate.savings > best.savings ||
      (candidate.savings === best.savings &&
        (candidate.codes > best.codes ||
          (candidate.codes === best.codes && candidate.applied.length < best.applied.length)))
    ) {
      best = candidate;
    }
  }

  const applied = best?.applied ?? [];
  const appliedIds = new Set(applied.map((entry) => entry.discountId));
  for (const rule of applicable) {
    if (!appliedIds.has(rule.id)) rejected.set(rule.id, { reason: "not-combinable" });
  }

  return {
    applied,
    itemsDiscountCents: applied.reduce((sum, entry) => sum + entry.amountCents, 0),
    shippingDiscountCents: applied.reduce((sum, entry) => sum + entry.shippingCents, 0),
    rejected,
  };
}
