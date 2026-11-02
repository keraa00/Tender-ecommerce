"use client";

import { PaymentElement } from "@stripe/react-stripe-js";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { PaymentChoice } from "@/lib/payments/cod";
import type { CheckoutMessages, CheckoutPaymentDisplay } from "./types";

/**
 * Checkout's Payment step: how the buyer pays, then whatever else payment
 * needs (the billing address goes in `children`), then the button that
 * confirms it.
 *
 * A store that takes cards only shows Stripe's Payment Element on its own, as
 * it always has; one that also takes cash on delivery lists the two, and one
 * that takes cash only shows that. The choice is posted as `paymentMethod`,
 * and the server re-prices for it — cash on delivery may carry a fee.
 *
 * The Element is told not to ask for name, email or billing address — the
 * form around it already has them, and they are handed to `confirmPayment`.
 * It stays mounted, hidden, while cash is chosen, so going back to the card
 * does not load it again. When the order comes to nothing there is no payment
 * to take, and no choice.
 */
export function PaymentSection({
  free,
  payment,
  method,
  onMethodChange,
  t,
  onReady,
  onLoadError,
  loadFailed,
  children,
  submit,
}: {
  /** True when discounts cover the whole order. */
  free: boolean;
  payment: CheckoutPaymentDisplay;
  /** The way the order is priced to be paid, as the form currently has it. */
  method: PaymentChoice | null;
  onMethodChange: (method: PaymentChoice) => void;
  t: CheckoutMessages;
  onReady: () => void;
  onLoadError: () => void;
  loadFailed: boolean;
  children?: ReactNode;
  /** The pay button, so it sits where payment is confirmed. */
  submit: ReactNode;
}) {
  const { stripe, cod } = payment;

  const element = stripe ? (
    loadFailed ? (
      <p
        role="alert"
        className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
      >
        {t.paymentLoadFailed}
      </p>
    ) : (
      <PaymentElement
        options={{
          layout: "accordion",
          fields: { billingDetails: { name: "never", email: "never", address: "never" } },
        }}
        onReady={onReady}
        onLoadError={onLoadError}
      />
    )
  ) : null;

  return (
    <section aria-labelledby="checkout-payment" className="space-y-4">
      <h2 id="checkout-payment" className="text-lg font-semibold tracking-tight">
        {t.payment}
      </h2>

      {free ? (
        <p className="rounded-lg border border-border-strong bg-surface-subtle p-4 text-sm text-pretty">
          {t.paymentFree}
        </p>
      ) : !cod ? (
        // Cards only: the Element on its own.
        <>
          <input type="hidden" name="paymentMethod" value="stripe" />
          {element}
        </>
      ) : (
        <div
          role="radiogroup"
          aria-labelledby="checkout-payment"
          className="divide-y divide-border overflow-hidden rounded-lg border border-border-strong"
        >
          {stripe ? (
            <div>
              <Option
                value="stripe"
                checked={method === "stripe"}
                onChange={onMethodChange}
                label={t.payOnline}
              />
              <div className={cn("border-t border-border bg-surface-subtle p-4", method !== "stripe" && "hidden")}>
                {element}
              </div>
            </div>
          ) : null}

          <div>
            <Option
              value="cod"
              checked={method === "cod"}
              disabled={cod.unavailable !== null}
              onChange={onMethodChange}
              label={cod.label}
              aside={cod.feeHint}
              detail={cod.unavailable}
            />
            {method === "cod" ? (
              <div className="space-y-1.5 border-t border-border bg-surface-subtle px-4 py-3.5 text-sm text-pretty">
                <p>{t.cod.hint}</p>
                {cod.instructions ? (
                  <p className="whitespace-pre-line break-words text-muted">{cod.instructions}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {children}

      {submit}
    </section>
  );
}

function Option({
  value,
  checked,
  disabled = false,
  onChange,
  label,
  aside,
  detail,
}: {
  value: PaymentChoice;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: PaymentChoice) => void;
  label: string;
  /** Beside the label, at the end: the fee. */
  aside?: string | null;
  /** Under the label: why it cannot be chosen. */
  detail?: string | null;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 px-4 py-3.5",
        disabled ? "cursor-default" : "cursor-pointer has-checked:bg-surface-hover",
      )}
    >
      <input
        type="radio"
        name="paymentMethod"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-medium break-words", disabled && "text-muted")}>
          {label}
        </span>
        {detail ? <span className="block text-xs text-muted">{detail}</span> : null}
      </span>
      {aside ? <span className="shrink-0 text-sm text-muted tabular">{aside}</span> : null}
    </label>
  );
}
