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
  showShipping = false,
  className,
}: {
  /** A cart, or a placed order shaped like one for its confirmation. */
  cart: Pick<CartDisplay, "subtotal" | "discounts" | "total">;
  t: CartMessages;
  /** Checkout shows the shipping line; the cart leaves it to the note. */
  showShipping?: boolean;
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

      {showShipping ? <Row label={t.shipping} value={t.free} /> : null}

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
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="min-w-0 text-muted">{label}</dt>
      <dd className={cn("shrink-0 tabular", valueClassName)}>{value}</dd>
    </div>
  );
}
