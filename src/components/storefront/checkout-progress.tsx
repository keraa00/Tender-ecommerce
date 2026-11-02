"use client";

/**
 * The moment between "Place order" and the thank-you page: the page dims, a
 * spinner in the store's colour turns while the order is placed and paid,
 * and once it is in, a green tick draws itself before checkout moves on.
 *
 * Over everything, so nothing can be clicked twice while it is up. Stripe's
 * own 3-D Secure window opens above it. With reduced motion the disc and the
 * tick simply appear.
 */
export function CheckoutProgress({
  state,
  label,
}: {
  state: "working" | "confirmed";
  /** "Placing order…", "Processing payment…", "Order confirmed". */
  label: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-4 backdrop-blur-sm transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none"
    >
      <div className="flex min-w-56 flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-10 py-8 text-center shadow-lg">
        {state === "confirmed" ? (
          <span className="grid h-14 w-14 place-items-center rounded-full bg-success text-white animate-confirm-pop motion-reduce:animate-none">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-8 w-8">
              <path
                d="M6 12.5l4 4L18 8"
                pathLength={1}
                strokeDasharray="1"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-confirm-tick motion-reduce:animate-none"
              />
            </svg>
          </span>
        ) : (
          <span
            aria-hidden
            className="block h-14 w-14 animate-spin rounded-full border-4 border-border border-t-store-accent"
          />
        )}
        <p className="text-base font-medium">{label}</p>
      </div>
    </div>
  );
}
