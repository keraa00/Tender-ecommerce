import type { CSSProperties, ReactNode } from "react";

import { CartDrawer } from "@/components/storefront/cart-drawer";
import {
  SheetLayer,
  StorefrontUIProvider,
} from "@/components/storefront/storefront-ui";
import { updateCartLineAction } from "@/lib/cart/actions";
import { cartCheckoutBlock } from "@/lib/checkout/availability";
import { getCartPricing } from "@/lib/checkout/pricing";
import { cn } from "@/lib/cn";
import type { Store } from "@/lib/db/types";
import { localeDirection } from "@/lib/i18n/locales";
import { toCartDisplay } from "@/lib/storefront/cart-display";
import { canAcceptOrders } from "@/lib/stores/policy";
import { storefrontAppearance } from "@/lib/theme/appearance";
import { getStorefrontContext } from "@/lib/theme/data";
import type { ThemeDocument } from "@/lib/theme/document";
import { themeFontClassNames } from "@/lib/theme/fonts";
import { ThemeSectionView } from "@/lib/theme/render";

/**
 * Everything around a storefront page: the theme's header and footer, its
 * colours and fonts, the checkout notice and the cart drawer.
 *
 * Shared by the public storefront, which passes the published theme, and the
 * theme editor's preview, which passes the seller's draft — so the preview is
 * the storefront, not a lookalike of it.
 */
export async function StorefrontFrame({
  store,
  theme,
  preview = false,
  children,
}: {
  store: Store;
  theme: ThemeDocument;
  /** Inside the theme editor: tag the header and footer for selection. */
  preview?: boolean;
  children: ReactNode;
}) {
  // The header and footer are theme sections like the home page's, drawn
  // here because every storefront page shares them.
  const [ctx, { cart, pricing }] = await Promise.all([
    getStorefrontContext(store),
    // Keyed by the resolved store id, and by this browser's own cart cookie.
    getCartPricing(store.id),
  ]);
  const { locale, t, paths } = ctx;
  const blocked = await cartCheckoutBlock(store, cart);

  const appearance = storefrontAppearance(theme.settings, store.accentColor);
  const updateLine = updateCartLineAction.bind(null, store.slug);

  return (
    <StorefrontUIProvider>
      <div
        lang={locale}
        dir={localeDirection(locale)}
        style={appearance.style as CSSProperties}
        className={cn("flex flex-1 flex-col", themeFontClassNames(appearance.fonts))}
        {...appearance.attributes}
      >
        <ThemeSectionView section={theme.layout.header} ctx={ctx} preview={preview} />

        {canAcceptOrders(store) ? null : (
          <p
            role="status"
            className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-center text-sm text-warning sm:px-6"
          >
            {t.banner.checkoutDisabled}
          </p>
        )}

        <main className="flex-1">{children}</main>

        <ThemeSectionView section={theme.layout.footer} ctx={ctx} preview={preview} />

        <CartDrawer
          cart={toCartDisplay(cart, pricing, store, locale)}
          t={t.cart}
          updateLine={updateLine}
          cartHref={paths.cart}
          catalogHref={paths.catalog}
          checkoutHref={blocked ? null : paths.checkout}
          checkoutBlockedNote={blocked === "no-shipping" ? t.cart.noShipping : null}
        />

        <SheetLayer />
      </div>
    </StorefrontUIProvider>
  );
}
