import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { CartDisplay, CartMessages } from "./types";

/**
 * Subtotal, what each discount took, and the total. The same component in the
 * drawer, on the cart page and at checkout, over the same `CartDisplay`, so
 * the three can never show a buyer different sums.
 */
export function CartSummary({
  cart,
  t,
  shipping,
  fee,
  className,
}: {
  /** A cart, or a placed order shaped like one for its confirmation. */
  cart: Pick<CartDisplay, "subtotal" | "discounts" | "total">;
  t: CartMessages;
  /**
   * Checkout's shipping line: the rate's price, "Free" with the price struck
   * through when a discount took it, or what checkout is waiting for. The
   * cart leaves shipping to its note, and an order of nothing that ships has
   * no line at all.
   */
  shipping?: { value: string; struck?: string | null } | null;
  /** What the way of paying adds — the cash-on-delivery fee — when it adds anything. */
  fee?: { label: string; value: string } | null;
  className?: string;
}) {
  return (
    <dl className={cn("space-y-2 text-sm", className)}>
      <Row label={t.subtotal} value={cart.subtotal} />

      {cart.discounts.map((discount) => (
        <Row
          key={discount.id}
          label={
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 break-words">{discount.title}</span>
              {discount.code ? (
                <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-muted ring-1 ring-border ring-inset">
                  {discount.code}
                </span>
              ) : null}
            </span>
          }
          value={discount.amount ?? t.freeShipping}
          valueClassName="text-success"
        />
      ))}

      {shipping ? (
        <Row
          label={t.shipping}
          value={
            shipping.struck ? (
              <span className="inline-flex items-baseline gap-2">
                <del className="text-xs text-muted">{shipping.struck}</del>
                <ins className="text-success no-underline">{shipping.value}</ins>
              </span>
            ) : (
              shipping.value
            )
          }
        />
      ) : null}

      {fee ? <Row label={fee.label} value={fee.value} /> : null}

      <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
        <dt className="font-medium">{t.total}</dt>
        <dd className="text-lg font-semibold tabular">{cart.total}</dd>
      </div>
    </dl>
  );
}

function Row({
  label,
  value,
  valueClassName,
}: {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="min-w-0 text-muted">{label}</dt>
      <dd className={cn("shrink-0 tabular", valueClassName)}>{value}</dd>
    </div>
  );
}
