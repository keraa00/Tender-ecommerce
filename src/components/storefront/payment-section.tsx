"use client";

import { PaymentElement } from "@stripe/react-stripe-js";
import type { ReactNode } from "react";

import type { CheckoutMessages } from "./types";

/**
 * Checkout's Payment step: Stripe's Payment Element, then whatever else
 * payment needs (the billing address goes in `children`), then the button
 * that confirms it.
 *
 * The Element is told not to ask for name, email or billing address — the
 * form around it already has them, and they are handed to `confirmPayment`.
 * When the order comes to nothing there is no payment to take, and no Element.
 */
export function PaymentSection({
  free,
  t,
  onReady,
  onLoadError,
  loadFailed,
  children,
  submit,
}: {
  /** True when discounts cover the whole order. */
  free: boolean;
  t: CheckoutMessages;
  onReady: () => void;
  onLoadError: () => void;
  loadFailed: boolean;
  children?: ReactNode;
  /** The pay button, so it sits where payment is confirmed. */
  submit: ReactNode;
}) {
  return (
    <section aria-labelledby="checkout-payment" className="space-y-4">
      <h2 id="checkout-payment" className="text-lg font-semibold tracking-tight">
        {t.payment}
      </h2>

      {free ? (
        <p className="rounded-lg border border-border-strong bg-surface-subtle p-4 text-sm text-pretty">
          {t.paymentFree}
        </p>
      ) : loadFailed ? (
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
      )}

      {children}

      {submit}
    </section>
  );
}
