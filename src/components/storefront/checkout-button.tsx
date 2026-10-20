import Link from "next/link";

import type { CartMessages } from "./types";

/**
 * The way from the cart to checkout. `href` is null while this cart cannot be
 * checked out (setup unfinished, suspended, or nowhere to ship it), and the
 * button then says why instead of leading to a page that would only turn the
 * buyer away.
 */
export function CheckoutButton({
  t,
  href,
  reason,
  onNavigate,
}: {
  t: CartMessages;
  href: string | null;
  /** Why not, when there is something more specific to say. */
  reason?: string | null;
  /** Lets the drawer close itself on the way out. */
  onNavigate?: () => void;
}) {
  const className =
    "flex h-12 w-full items-center justify-center rounded-lg bg-store-accent text-base font-medium text-white";

  if (href) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={`${className} transition-colors hover:bg-store-accent-hover`}
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
      >
        {t.checkout}
      </button>
      <p className="mt-2 text-center text-xs text-muted">{reason ?? t.checkoutUnavailable}</p>
    </div>
  );
}
