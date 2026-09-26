import type { CartMessages } from "./types";

/**
 * Checkout itself is not built yet, so this is a disabled button that says so
 * rather than a link to a page that does not exist. When the Stripe flow lands,
 * this is the one place that needs to learn about it.
 */
export function CheckoutButton({ t }: { t: CartMessages }) {
  return (
    <div>
      <button
        type="button"
        disabled
        className="h-12 w-full rounded-lg text-base font-medium text-white opacity-50"
        style={{ backgroundColor: "var(--store-accent)" }}
      >
        {t.checkout}
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        {t.checkoutUnavailable}
      </p>
    </div>
  );
}
