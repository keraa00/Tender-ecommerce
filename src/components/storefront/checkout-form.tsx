"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useActionState,
  useRef,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import type { CheckoutState } from "@/lib/checkout/actions";
import { CHECKOUT_MAX_LENGTH, type CheckoutField } from "@/lib/checkout/fields";
import { CartSummary } from "./cart-summary";
import type { CartDisplay, CartMessages, CheckoutMessages } from "./types";

/**
 * Checkout: contact and shipping on one side, the order on the other. The
 * summary is rendered by the server from the cart, so when the buyer leaves
 * the email field it is saved to the cart and the page re-renders priced for
 * them. The form's own inputs are uncontrolled and survive that re-render.
 *
 * `codeForm` is the discount code box. It is a set of forms of its own, so it
 * sits beside the checkout form rather than inside it, and the place-order
 * button reaches back to the checkout form through its `form` attribute.
 */
export function CheckoutForm({
  cart,
  t,
  cartT,
  initialEmail,
  placeOrder,
  saveEmail,
  codeForm,
  cartHref,
}: {
  cart: CartDisplay;
  t: CheckoutMessages;
  cartT: CartMessages;
  initialEmail: string;
  placeOrder: (state: CheckoutState, formData: FormData) => Promise<CheckoutState>;
  saveEmail: (formData: FormData) => Promise<void>;
  codeForm: ReactNode;
  cartHref: string;
}) {
  const [state, formAction, placing] = useActionState(placeOrder, {});
  const [repricing, startRepricing] = useTransition();
  const lastEmail = useRef(initialEmail.trim().toLowerCase());
  const formId = "checkout-form";

  const fieldError = (name: CheckoutField) => {
    const code = state.fieldErrors?.[name];
    if (!code) return undefined;
    // "tooLong" cannot come from this form — the inputs carry the same
    // `maxLength` — so it shares the generic wording.
    return code === "email" ? t.errors.email : t.errors.required;
  };

  const formError =
    state.error === "total-changed"
      ? t.errors.totalChanged.replace("{total}", state.total ?? cart.total)
      : state.error === "stock-changed"
        ? t.errors.stockChanged
        : state.error === "discount-unavailable"
          ? t.errors.discountUnavailable
          : state.error === "unavailable"
            ? t.unavailable
            : state.error
              ? t.errors.failed
              : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <form id={formId} action={formAction} noValidate className="space-y-8">
        {/* The total the buyer is looking at. The server refuses to place the
            order at any other, rather than charge a surprise. */}
        <input type="hidden" name="expectedTotal" value={cart.totalCents} />

        {formError ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">{t.contact}</h2>
          <TextField
            name="email"
            label={t.email}
            hint={t.emailHint}
            error={fieldError("email")}
            type="email"
            autoComplete="email"
            defaultValue={initialEmail}
            onBlur={(event) => {
              const email = event.currentTarget.value.trim().toLowerCase();
              if (!email.includes("@") || email === lastEmail.current) return;
              lastEmail.current = email;
              const data = new FormData();
              data.set("email", email);
              startRepricing(() => saveEmail(data));
            }}
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">{t.shippingAddress}</h2>
          <TextField name="name" label={t.name} error={fieldError("name")} autoComplete="name" />
          <TextField
            name="address1"
            label={t.address1}
            error={fieldError("address1")}
            autoComplete="address-line1"
          />
          <TextField
            name="address2"
            label={t.address2}
            error={fieldError("address2")}
            autoComplete="address-line2"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="city"
              label={t.city}
              error={fieldError("city")}
              autoComplete="address-level2"
            />
            <TextField
              name="region"
              label={t.region}
              error={fieldError("region")}
              autoComplete="address-level1"
            />
            <TextField
              name="postalCode"
              label={t.postalCode}
              error={fieldError("postalCode")}
              autoComplete="postal-code"
            />
            <TextField
              name="country"
              label={t.country}
              error={fieldError("country")}
              autoComplete="country-name"
            />
          </div>
        </section>
      </form>

      <aside className="h-fit space-y-5 rounded-2xl border border-border bg-surface-subtle p-6 lg:sticky lg:top-24">
        <h2 className="text-lg font-semibold tracking-tight">{t.summary}</h2>

        <ul className="divide-y divide-border">
          {cart.lines
            .filter((line) => line.available)
            .map((line) => (
              <li key={line.id} className="flex items-center gap-3 py-3 text-sm">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface">
                  {line.imageUrl ? (
                    <Image src={line.imageUrl} alt={line.imageAlt} fill sizes="48px" className="object-cover" />
                  ) : null}
                  <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1 text-[11px] font-medium text-background tabular">
                    {line.quantity}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2">{line.productTitle}</span>
                  {line.showVariantTitle ? (
                    <span className="block text-muted">{line.variantTitle}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-end tabular">
                  {line.discountedTotal ? (
                    <>
                      <del className="block text-xs text-muted">{line.lineTotal}</del>
                      <ins className="block text-success no-underline">{line.discountedTotal}</ins>
                    </>
                  ) : (
                    line.lineTotal
                  )}
                </span>
              </li>
            ))}
        </ul>

        {codeForm}

        <div
          aria-busy={repricing}
          className={cn("transition-opacity", repricing && "opacity-50")}
        >
          <CartSummary cart={cart} t={cartT} showShipping />
        </div>

        <button
          type="submit"
          form={formId}
          disabled={placing || repricing}
          className="flex h-12 w-full cursor-pointer items-center justify-center rounded-lg text-base font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
          style={{ backgroundColor: "var(--store-accent)" }}
        >
          {placing ? t.placing : t.placeOrder}
        </button>

        <p className="text-xs text-muted text-pretty">{t.paymentNote}</p>

        <Link
          href={cartHref}
          className="block text-center text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          {t.backToCart}
        </Link>
      </aside>
    </div>
  );
}

function TextField({
  name,
  label,
  hint,
  error,
  ...props
}: {
  name: CheckoutField;
  label: string;
  hint?: string;
  error?: string;
} & Omit<ComponentProps<"input">, "name">) {
  const id = `checkout-${name}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        maxLength={CHECKOUT_MAX_LENGTH[name]}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm aria-[invalid=true]:border-danger"
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
