import Image from "next/image";
import Link from "next/link";

import {
  CartButton,
  LanguageSwitcher,
  MobileMenu,
  NavLinks,
} from "@/components/storefront/header-controls";
import { SearchPanel } from "@/components/storefront/search-panel";
import { defineSection } from "../define";
import { field } from "../fields";

export default defineSection({
  type: "header",
  name: "Header",
  description: "Your store's name, menu, search and cart.",
  layout: "full-bleed",
  pinned: "header",
  settings: {
    showLogo: field.checkbox({
      label: "Show logo",
      help: "Uses the logo from Settings. Off, the header shows a square in your accent colour.",
      default: false,
    }),
  },
  async Component({ section, ctx }) {
    const { store, paths, t, locale, nav } = ctx;
    const logoUrl = section.settings.showLogo ? store.logoUrl : null;
    const cartCount = await ctx.data.cartItemCount();

    return (
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-1 px-4 sm:px-6">
          <MobileMenu
            items={nav}
            storeName={store.name}
            menuLabel={t.nav.menu}
            closeLabel={t.nav.closeMenu}
          />

          <Link
            href={paths.home}
            className="flex min-w-0 items-center gap-2.5 pe-2"
          >
            {/* The logo is the seller's mark for their admin; buyers see the
                accent unless the theme opts in. */}
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="h-8 w-8 shrink-0 rounded-lg"
                style={{ backgroundColor: "var(--store-accent)" }}
              />
            )}
            <span className="truncate text-lg font-semibold tracking-tight">
              {store.name}
            </span>
          </Link>

          <NavLinks items={nav} className="ms-4 hidden lg:block" />

          <div className="ms-auto flex shrink-0 items-center gap-0.5">
            <LanguageSwitcher locale={locale} label={t.header.language} />
            <SearchPanel
              action={paths.search}
              suggestionsUrl={paths.searchSuggestions}
              label={t.header.search}
              closeLabel={t.cart.close}
              soldOutLabel={t.product.soldOut}
              t={t.search}
            />
            <CartButton href={paths.cart} label={t.header.cart} count={cartCount} />
          </div>
        </div>
      </header>
    );
  },
});
