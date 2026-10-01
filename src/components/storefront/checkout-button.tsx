import Link from "next/link";

import type { CartMessages } from "./types";

/**
 * The way from the cart to checkout. `href` is null while the store cannot
 * take orders (setup unfinished, or suspended), and the button then says so
 * instead of leading to a page that would only turn the buyer away.
 */
export function CheckoutButton({
  t,
  href,
  onNavigate,
}: {
  t: CartMessages;
  href: string | null;
  /** Lets the drawer close itself on the way out. */
  onNavigate?: () => void;
}) {
  const className =
    "flex h-12 w-full items-center justify-center rounded-lg text-base font-medium text-white";

  if (href) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={`${className} transition-opacity hover:opacity-90`}
        style={{ backgroundColor: "var(--store-accent)" }}
      >
        {t.checkout}
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled
        className={`${className} opacity-50`}
        style={{ backgroundColor: "var(--store-accent)" }}
      >
        {t.checkout}
      </button>
      <p className="mt-2 text-center text-xs text-muted">{t.checkoutUnavailable}</p>
    </div>
  );
}
