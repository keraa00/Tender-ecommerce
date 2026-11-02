"use client";

import { Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Appearance, StripeElementLocale } from "@stripe/stripe-js";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";

import type { AddressErrorCode, AddressRules, RawAddress } from "@/lib/address/validate";
import type { CheckoutState, PlaceOrderResponse } from "@/lib/checkout/actions";
import type { CheckoutDraft } from "@/lib/checkout/draft";
import { CHECKOUT_MAX_LENGTH, codShippingAddressRules, type AddressPrefix } from "@/lib/checkout/fields";
import { cn } from "@/lib/cn";
import type { PaymentChoice } from "@/lib/payments/cod";
import type { StripeBillingDetails } from "@/lib/payments/rules";
import { stripeForAccount } from "@/lib/stripe/client";
import { AddressFields } from "./address-fields";
import { CartSummary } from "./cart-summary";
import { CheckoutProgress } from "./checkout-progress";
import { ChevronDownIcon } from "./icons";
import { PaymentSection } from "./payment-section";
import type {
  CartDisplay,
  CartMessages,
  CheckoutMessages,
  CheckoutPaymentDisplay,
  CheckoutShippingDisplay,
  CountryOptionDisplay,
} from "./types";

/**
 * Checkout, on one page, as Shopify lays it out: contact, delivery, shipping
 * method and payment on one side, the order on the other — and, on a phone,
 * the order folded into a bar above the form that shows the total.
 *
 * The server is the only source of truth for prices. Every change that could
 * move them — the email (segment discounts), the address (which zone, which
 * rates), the rate — is saved to the cart, and the page re-renders priced for
 * it. The form's own fields are controlled, so they survive that re-render;
 * the total it echoes back on submit is the one the server last showed.
 *
 * `codeForms` is the discount code box, once for each summary — the folded
 * one on a phone and the one beside the form. It is a set of forms of its
 * own, so it lives in the summary, outside this form.
 *
 * Paying online is two steps behind one button: the server places the order
 * and creates its PaymentIntent, then the Payment Element confirms it.
 * Stripe.js loads as the store's connected account, since that is where the
 * charge is. Paying in cash on delivery is one: the server places the order
 * and sends the buyer to the confirmation. A store that takes cash only loads
 * no Stripe.js at all.
 */
export function CheckoutForm(props: CheckoutFormProps) {
  const { payment, cart } = props;
  const stripe = payment.stripe;

  // Hooks below ask for Stripe either way; without it they answer null.
  if (!stripe) {
    return (
      <Elements stripe={null}>
        <CheckoutFormBody {...props} />
      </Elements>
    );
  }

  const accent = stripe.accentColor && /^#[0-9a-f]{3,8}$/i.test(stripe.accentColor)
    ? stripe.accentColor
    : undefined;

  // The storefront is always light. The Payment Element is an iframe and
  // cannot read the page's CSS, so it is told to match.
  const appearance: Appearance = {
    theme: "stripe",
    variables: accent ? { colorPrimary: accent } : {},
  };

  return (
    <Elements
      stripe={stripeForAccount(stripe.publishableKey, stripe.stripeAccountId)}
      options={{
        mode: "payment",
        // Shown by wallets and pay-later methods, and kept current as the
        // order re-prices. A free order mounts no Element, but Elements still
        // wants a positive amount to start from.
        amount: cart.totalCents > 0 ? cart.totalCents : 100,
        currency: stripe.currency,
        locale: stripe.locale as StripeElementLocale,
        appearance,
      }}
    >
      <CheckoutFormBody {...props} />
    </Elements>
  );
}

type CheckoutFormProps = {
  cart: CartDisplay;
  t: CheckoutMessages;
  cartT: CartMessages;
  initialEmail: string;
  /** What the buyer had typed, from the cart — the default country filled in. */
  draft: CheckoutDraft;
  /** False when nothing in the cart ships: no delivery step at all. */
  needsShipping: boolean;
  /** Only the countries the store ships to. */
  shippingCountries: CountryOptionDisplay[];
  /** Anywhere: a card can be billed to any country. */
  billingCountries: CountryOptionDisplay[];
  shippingRules: AddressRules;
  billingRules: AddressRules;
  orderNote: boolean;
  marketingOptIn: boolean;
  shipping: CheckoutShippingDisplay;
  payment: CheckoutPaymentDisplay;
  placeOrder: (formData: FormData) => Promise<PlaceOrderResponse>;
  save: (formData: FormData) => Promise<void>;
  /** One element per place it is drawn: an element is rendered once. */
  codeForms: { folded: ReactNode; aside: ReactNode };
  cartHref: string;
  /** The thank-you page: where checkout goes once the order is in. */
  completeHref: string;
};

/** Long enough to see the tick drawn before the thank-you page takes over. */
const CONFIRMED_PAUSE_MS = 1100;

/** What the form shows after a submit: the server's answer, or Stripe's. */
type FormState = Omit<CheckoutState, "error"> & {
  error?: CheckoutState["error"] | "payment";
  /** Stripe's own words for a declined card or a bad card number. */
  paymentMessage?: string;
};

/** The order placed for this form as it stands, ready to confirm again. */
type PlacedIntent = {
  key: string;
  clientSecret: string;
  billingDetails: StripeBillingDetails;
};

function CheckoutFormBody({
  cart,
  t,
  cartT,
  initialEmail,
  draft,
  needsShipping,
  shippingCountries,
  billingCountries,
  shippingRules,
  billingRules,
  orderNote,
  marketingOptIn,
  shipping,
  payment,
  placeOrder,
  save,
  codeForms,
  cartHref,
  completeHref,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [state, setState] = useState<FormState>({});
  const [placing, startPlacing] = useTransition();
  const [repricing, startRepricing] = useTransition();
  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentLoadFailed, setPaymentLoadFailed] = useState(false);
  const placed = useRef<PlacedIntent | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const free = cart.totalCents === 0;

  const [email, setEmail] = useState(initialEmail);
  const [optIn, setOptIn] = useState(draft.marketingOptIn);
  const [shipTo, setShipTo] = useState<RawAddress>(draft.shipping);
  const [billingMode, setBillingMode] = useState(draft.billingSameAsShipping ? "same" : "different");
  const [billTo, setBillTo] = useState<RawAddress>(draft.billing);
  const [note, setNote] = useState(draft.note);
  const [saveInfo, setSaveInfo] = useState(draft.saveInfo);
  const [rateId, setRateId] = useState(shipping.selectedId);
  const [methodChoice, setMethodChoice] = useState<PaymentChoice | null>(payment.selected);

  // A pick the server no longer offers (the address moved, the cart grew)
  // gives way to the server's choice, which is the cheapest.
  const selectedRate = shipping.rates.some((rate) => rate.id === rateId)
    ? rateId
    : shipping.selectedId;

  // The same for the way of paying: cash on delivery can stop applying when
  // the country or the total changes, and the server then prices for the card.
  const usable = (choice: PaymentChoice | null) =>
    choice === "stripe" ? payment.stripe !== null : choice === "cod" ? payment.cod?.unavailable === null : false;
  const method = usable(methodChoice) ? methodChoice : payment.selected;
  const cashOnDelivery = !free && method === "cod";

  // A courier rings before handing over a parcel that has to be paid for.
  const deliveryRules =
    cashOnDelivery && payment.cod
      ? codShippingAddressRules(shippingRules, payment.cod.requiresPhone)
      : shippingRules;

  // --- Saving, so the server can re-price ------------------------------------

  const lastSaved = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (formRef.current) lastSaved.current = snapshot(formRef.current);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /**
   * Saves the form to the cart, after `delay` ms of quiet — immediately for a
   * choice, a moment later while typing. Server Actions run one at a time, so
   * the debounce and the "nothing changed" check keep the queue short.
   */
  function commit(delay = 0) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const current = snapshot(form);
      if (current === lastSaved.current) return;
      lastSaved.current = current;
      const data = new FormData(form);
      startRepricing(() => save(data));
    }, delay);
  }

  function setShippingField(field: keyof RawAddress, value: string) {
    setShipTo((current) => ({ ...current, [field]: value }));
    // Typing in a location field can change the rates; give it a moment.
    // Selects commit at once, from the fields component.
    if (field !== "countryCode" && field !== "region") commit(900);
  }

  function setBillingField(field: keyof RawAddress, value: string) {
    setBillTo((current) => ({ ...current, [field]: value }));
  }

  // --- Errors ----------------------------------------------------------------

  const fieldErrors = state.fieldErrors ?? {};
  const addressErrors = (prefix: AddressPrefix) => {
    const errors: Partial<Record<keyof RawAddress, AddressErrorCode>> = {};
    for (const [key, code] of Object.entries(fieldErrors)) {
      if (key.startsWith(`${prefix}.`) && code && code !== "email") {
        errors[key.slice(prefix.length + 1) as keyof RawAddress] = code;
      }
    }
    return errors;
  };

  // Take the buyer to the first thing to fix.
  useEffect(() => {
    if (!state.fieldErrors) return;
    formRef.current
      ?.querySelector<HTMLElement>("[aria-invalid=true]")
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state]);

  const formError = (() => {
    switch (state.error) {
      case undefined:
        return null;
      case "total-changed":
        return t.errors.totalChanged.replace("{total}", state.total ?? cart.total);
      case "stock-changed":
      case "empty":
        return t.errors.stockChanged;
      case "discount-unavailable":
        return t.errors.discountUnavailable;
      case "shipping-unavailable":
        return t.errors.shippingUnavailable;
      case "shipping-changed":
        return t.errors.shippingChanged;
      case "payment-method-changed":
        return t.errors.paymentMethodChanged;
      case "unavailable":
        return t.unavailable;
      case "payment":
        return state.paymentMessage ?? t.errors.paymentDeclined;
      case "payment-unavailable":
        return t.errors.paymentUnavailable;
      case "below-minimum":
        return t.errors.belowMinimum;
      case "payment-processing":
        return t.errors.paymentProcessing;
      default:
        return t.errors.failed;
    }
  })();

  // --- Paying ------------------------------------------------------------------

  /** The order is in: show it confirmed, then put the thank-you page in checkout's place. */
  function confirm() {
    setConfirmed(true);
    setTimeout(() => router.replace(completeHref), CONFIRMED_PAUSE_MS);
  }

  /**
   * Places the order, then confirms its payment. A declined card leaves the
   * order and its PaymentIntent in place, so trying another card — with the
   * form unchanged — confirms the same PaymentIntent again rather than placing
   * a second order. Change anything and the next attempt places a fresh order;
   * the server cancels the old one first.
   *
   * Cards, wallets and 3-D Secure finish here, in Stripe's own window over the
   * page, and the order is shown confirmed before moving on. Only a payment
   * method that has to visit the bank's site leaves through `return_url`.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timer.current) clearTimeout(timer.current);

    const form = event.currentTarget;
    const data = new FormData(form);
    const key = `${snapshot(form)}|${cart.totalCents}`;
    const show = (next: FormState) => startTransition(() => setState(next));

    startPlacing(async () => {
      if (free || cashOnDelivery) {
        // Nothing to pay now: placing the order is the whole of it.
        const result = await placeOrder(data);
        if (result.ok) confirm();
        else show(result);
        return;
      }

      if (!stripe || !elements) return;

      // First, inside the click: wallets need the user's gesture.
      const { error: invalid } = await elements.submit();
      if (invalid) {
        show({ error: "payment", paymentMessage: invalid.message });
        return;
      }

      let intent = placed.current?.key === key ? placed.current : null;
      if (!intent) {
        const result = await placeOrder(data);
        if (!result.ok) {
          show(result);
          return;
        }
        // An earlier attempt turned out to be paid after all.
        if (result.kind === "done") {
          confirm();
          return;
        }
        intent = { key, clientSecret: result.clientSecret, billingDetails: result.billingDetails };
        placed.current = intent;
      }

      const { error } = await stripe.confirmPayment({
        elements,
        clientSecret: intent.clientSecret,
        confirmParams: {
          return_url: new URL(completeHref, window.location.href).toString(),
          payment_method_data: { billing_details: intent.billingDetails },
        },
        redirect: "if_required",
      });

      // Succeeded, or on its way (a bank debit): the thank-you page reads
      // which from Stripe, and settles the order if it is paid.
      if (!error) {
        confirm();
        return;
      }

      const cardProblem = error.type === "card_error" || error.type === "validation_error";
      // Anything else (the PaymentIntent was cancelled from another tab, say)
      // means this one cannot be retried; the next attempt starts afresh.
      if (!cardProblem) placed.current = null;
      show({ error: "payment", paymentMessage: cardProblem ? error.message : undefined });
    });
  }

  const cannotShip = needsShipping && shipping.state !== "ready";
  const cannotPay =
    !free && (method === null || (method === "stripe" && (!paymentReady || !stripe || !elements)));

  // "Save my information for next time": with the delivery address, or with
  // the billing address when nothing ships. Unticking saves at once, which is
  // what forgets the saved details.
  const saveInfoBox = (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        name="saveInfo"
        checked={saveInfo}
        onChange={(event) => {
          setSaveInfo(event.target.checked);
          commit();
        }}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block">{t.saveInfo}</span>
        <span className="block text-xs text-muted">{t.saveInfoHint}</span>
      </span>
    </label>
  );

  const summary = (codeForm: ReactNode) => (
    <OrderSummary cart={cart} cartT={cartT} t={t} shipping={shipping} repricing={repricing}>
      {codeForm}
    </OrderSummary>
  );

  return (
    <>
      {placing || confirmed ? (
        <CheckoutProgress
          state={confirmed ? "confirmed" : "working"}
          label={confirmed ? t.confirmed : free || cashOnDelivery ? t.placing : t.paying}
        />
      ) : null}

      {/* On a phone the order folds into a bar above the form — the total is
          what a buyer checks most — and opens in place. Works without JS. */}
      <details className="group border-b border-border bg-surface-subtle lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden">
          <span
            className="flex items-center gap-1.5 text-sm font-medium"
            style={{ color: "var(--store-accent)" }}
          >
            <span className="group-open:hidden">{t.showSummary}</span>
            <span className="hidden group-open:inline">{t.hideSummary}</span>
            <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180" />
          </span>
          <span className={cn("text-lg font-semibold tabular transition-opacity", repricing && "opacity-50")}>
            {cart.total}
          </span>
        </summary>
        <div className="px-4 pb-6">{summary(codeForms.folded)}</div>
      </details>

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-14 lg:py-10">
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="min-w-0 space-y-10">
          {/* The total the buyer is looking at. The server refuses to place
              the order at any other, rather than charge a surprise. */}
          <input type="hidden" name="expectedTotal" value={cart.totalCents} />

          <Section id="checkout-contact" title={t.contact}>
            <div className="space-y-1.5">
              <label htmlFor="checkout-email" className="block text-sm font-medium">
                {t.email}
              </label>
              <input
                id="checkout-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={CHECKOUT_MAX_LENGTH.email}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                // Leaving the field re-prices: a first-order code starts
                // applying, a customer-only offer appears.
                onBlur={() => commit()}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "checkout-email-error" : "checkout-email-hint"}
                className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm aria-[invalid=true]:border-danger"
              />
              {fieldErrors.email ? (
                <p id="checkout-email-error" role="alert" className="text-sm text-danger">
                  {fieldErrors.email === "email" ? t.errors.email : t.errors.required}
                </p>
              ) : (
                <p id="checkout-email-hint" className="text-xs text-muted">
                  {t.emailHint}
                </p>
              )}
            </div>
            {marketingOptIn ? (
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name="marketingOptIn"
                  checked={optIn}
                  onChange={(event) => {
                    setOptIn(event.target.checked);
                    commit();
                  }}
                />
                {t.marketingOptIn}
              </label>
            ) : null}
          </Section>

          {needsShipping ? (
            <Section id="checkout-delivery" title={t.delivery}>
              <AddressFields
                prefix="shipping"
                value={shipTo}
                onChange={setShippingField}
                onCommit={() => commit()}
                countries={shippingCountries}
                rules={deliveryRules}
                errors={addressErrors("shipping")}
                t={t}
              />
              {saveInfoBox}
            </Section>
          ) : null}

          {needsShipping ? (
            <Section id="checkout-shipping-method" title={t.shippingMethod}>
              {shipping.state === "ready" ? (
                <div
                  role="radiogroup"
                  aria-labelledby="checkout-shipping-method"
                  className="divide-y divide-border overflow-hidden rounded-lg border border-border-strong"
                >
                  {shipping.rates.map((rate) => (
                    <label
                      key={rate.id}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3.5 has-checked:bg-surface-hover"
                    >
                      <input
                        type="radio"
                        name="shippingRateId"
                        value={rate.id}
                        checked={selectedRate === rate.id}
                        onChange={() => {
                          setRateId(rate.id);
                          commit();
                        }}
                        className="shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium break-words">{rate.name}</span>
                        {rate.estimate ? (
                          <span className="block text-xs text-muted">{rate.estimate}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular">{rate.price}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p
                  role={shipping.state === "address-needed" ? undefined : "alert"}
                  className={cn(
                    "rounded-lg border px-4 py-3.5 text-sm text-pretty",
                    shipping.state === "address-needed"
                      ? "border-border bg-surface-subtle text-muted"
                      : "border-warning/30 bg-warning/10 text-warning",
                  )}
                >
                  {shipping.state === "not-shipped"
                    ? t.shippingNotShipped
                    : shipping.state === "no-rates"
                      ? t.shippingNoRates
                      : t.shippingAddressNeeded}
                </p>
              )}
              {fieldErrors.shippingRate && shipping.state === "ready" ? (
                <p role="alert" className="text-sm text-danger">
                  {t.errors.shippingRate}
                </p>
              ) : null}
            </Section>
          ) : null}

          {orderNote ? (
            <div className="space-y-1.5">
              <label htmlFor="checkout-note" className="block text-sm font-medium">
                {t.optional.replace("{label}", t.note)}
              </label>
              <textarea
                id="checkout-note"
                name="note"
                rows={3}
                maxLength={CHECKOUT_MAX_LENGTH.note}
                value={note}
                placeholder={t.notePlaceholder}
                onChange={(event) => setNote(event.target.value)}
                onBlur={() => commit()}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm"
              />
            </div>
          ) : null}

          <PaymentSection
            free={free}
            payment={payment}
            method={method}
            onMethodChange={(choice) => {
              setMethodChoice(choice);
              commit();
            }}
            t={t}
            onReady={() => setPaymentReady(true)}
            onLoadError={() => setPaymentLoadFailed(true)}
            loadFailed={paymentLoadFailed}
            submit={
              <div className="space-y-3 pt-2">
                {/* By the button: it is where the buyer is looking when an
                    attempt fails. */}
                {formError ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                  >
                    {formError}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={placing || repricing || cannotShip || cannotPay}
                  className="flex h-13 w-full cursor-pointer items-center justify-center rounded-lg text-base font-semibold text-white bg-store-accent transition-colors hover:bg-store-accent-hover disabled:cursor-default disabled:opacity-50 disabled:hover:bg-store-accent"
                >
                  {free || cashOnDelivery
                    ? placing
                      ? t.placing
                      : t.placeOrder
                    : placing
                      ? t.paying
                      : t.payNow}
                </button>
                <Link
                  href={cartHref}
                  className="block text-center text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
                >
                  {t.backToCart}
                </Link>
              </div>
            }
          >
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{t.billingAddress}</h3>
              {needsShipping ? (
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border-strong">
                  {(["same", "different"] as const).map((mode) => (
                    <label
                      key={mode}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3.5 text-sm has-checked:bg-surface-hover"
                    >
                      <input
                        type="radio"
                        name="billingAddress"
                        value={mode}
                        checked={billingMode === mode}
                        onChange={() => {
                          setBillingMode(mode);
                          commit();
                        }}
                      />
                      {mode === "same" ? t.billingSame : t.billingDifferent}
                    </label>
                  ))}
                </div>
              ) : null}
              {!needsShipping || billingMode === "different" ? (
                <div className={cn(needsShipping && "rounded-lg border border-border bg-surface-subtle p-4")}>
                  <AddressFields
                    prefix="billing"
                    value={billTo}
                    onChange={setBillingField}
                    onCommit={() => commit()}
                    countries={billingCountries}
                    rules={billingRules}
                    errors={addressErrors("billing")}
                    t={t}
                  />
                </div>
              ) : null}
              {needsShipping ? null : saveInfoBox}
            </div>
          </PaymentSection>
        </form>

        <aside className="hidden h-fit space-y-5 rounded-2xl border border-border bg-surface-subtle p-6 lg:sticky lg:top-8 lg:block">
          <h2 className="text-lg font-semibold tracking-tight">{t.summary}</h2>
          {summary(codeForms.aside)}
        </aside>
      </div>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The lines, the code box, and the sums — the same on a phone and beside the form. */
function OrderSummary({
  cart,
  cartT,
  t,
  shipping,
  repricing,
  children,
}: {
  cart: CartDisplay;
  cartT: CartMessages;
  t: CheckoutMessages;
  shipping: CheckoutShippingDisplay;
  repricing: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <ul className="divide-y divide-border">
        {cart.lines
          .filter((line) => line.available)
          .map((line) => (
            <li key={line.id} className="flex items-center gap-3 py-3 text-sm">
              <span className="relative h-14 w-14 shrink-0 rounded-lg border border-border bg-surface">
                <span className="absolute inset-0 overflow-hidden rounded-lg">
                  {line.imageUrl ? (
                    <Image src={line.imageUrl} alt={line.imageAlt} fill sizes="56px" className="object-cover" />
                  ) : null}
                </span>
                <span className="absolute -end-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1 text-[11px] font-medium text-background tabular">
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

      {children}

      <div aria-busy={repricing} className={cn("transition-opacity", repricing && "opacity-50")}>
        <CartSummary
          cart={cart}
          t={cartT}
          fee={cart.paymentFee ? { label: t.cod.fee, value: cart.paymentFee } : null}
          shipping={
            shipping.summary
              ? shipping.summary
              : shipping.state === "not-required"
                ? null
                : { value: t.shippingPending }
          }
        />
      </div>
    </div>
  );
}

/** The form's fields as one string, to tell whether anything needs saving. */
function snapshot(form: HTMLFormElement): string {
  const parts: string[] = [];
  for (const [name, value] of new FormData(form)) {
    if (name === "expectedTotal" || typeof value !== "string") continue;
    parts.push(`${name}=${value}`);
  }
  return parts.join("&");
}
