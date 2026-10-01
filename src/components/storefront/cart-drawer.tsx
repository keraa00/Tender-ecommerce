"use client";

import Link from "next/link";

import { CartLineList } from "./cart-lines";
import { CartSummary } from "./cart-summary";
import { CheckoutButton } from "./checkout-button";
import { Sheet, SheetHeader, usePanel } from "./storefront-ui";
import type { CartDisplay, CartMessages } from "./types";

export function CartDrawer({
  cart,
  t,
  updateLine,
  cartHref,
  catalogHref,
  checkoutHref,
}: {
  cart: CartDisplay;
  t: CartMessages;
  updateLine: (formData: FormData) => Promise<void>;
  cartHref: string;
  catalogHref: string;
  /** Null while the store cannot take orders. */
  checkoutHref: string | null;
}) {
  const { panel, setPanel } = usePanel();
  const close = () => setPanel(null);

  return (
    <Sheet
      open={panel === "cart"}
      onClose={close}
      side="end"
      label={t.title}
      closeLabel={t.close}
    >
      <SheetHeader
        title={
          <>
            {t.title}
            {cart.itemCount > 0 ? (
              <span className="ms-2 text-sm font-normal text-muted">
                {cart.itemCountLabel}
              </span>
            ) : null}
          </>
        }
        closeLabel={t.close}
        onClose={close}
      />

      {cart.lines.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div>
            <p className="font-medium">{t.empty}</p>
            <p className="mt-1 text-sm text-muted">{t.emptyHint}</p>
            <Link
              href={catalogHref}
              onClick={close}
              className="mt-6 inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium transition-colors hover:bg-surface-hover"
            >
              {t.continueShopping}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6">
            <CartLineList
              lines={cart.lines}
              t={t}
              updateLine={updateLine}
              onNavigate={close}
            />
          </div>

          <div className="shrink-0 space-y-3 border-t border-border px-4 py-4 sm:px-6">
            <CartSummary cart={cart} t={t} />
            <p className="text-xs text-muted">{t.shippingNote}</p>
            <CheckoutButton t={t} href={checkoutHref} onNavigate={close} />
            <Link
              href={cartHref}
              onClick={close}
              className="block text-center text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
            >
              {t.viewCart}
            </Link>
          </div>
        </>
      )}
    </Sheet>
  );
}
