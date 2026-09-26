import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { CartDrawer } from "@/components/storefront/cart-drawer";
import {
  CartButton,
  LanguageSwitcher,
  MobileMenu,
  NavLinks,
  SearchPanel,
} from "@/components/storefront/header-controls";
import { StorefrontUIProvider } from "@/components/storefront/storefront-ui";
import type { NavItem } from "@/components/storefront/types";
import { updateCartLineAction } from "@/lib/cart/actions";
import { getCart } from "@/lib/cart/queries";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { toCartDisplay } from "@/lib/storefront/cart-display";
import { storefrontPaths } from "@/lib/storefront/links";
import { getStoreBySlug } from "@/lib/stores/queries";
import { canAcceptOrders, isStorePubliclyVisible } from "@/lib/stores/policy";

export default async function StorefrontLayout({
  children,
  params,
}: LayoutProps<"/s/[storeSlug]">) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);

  if (!store) notFound();

  const accent = store.accentColor ?? "var(--primary)";

  if (!isStorePubliclyVisible(store)) {
    return (
      <div className="grid flex-1 place-items-center px-4 py-24 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">
            This store is unavailable
          </h1>
          <p className="mt-2 text-sm text-muted text-pretty">
            {store.name} has been suspended and is not currently trading.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
          >
            Browse other stores
          </Link>
        </div>
      </div>
    );
  }

  const [{ locale, t }, cart] = await Promise.all([
    getStorefrontI18n(),
    // Keyed by the resolved store id, and by this browser's own cart cookie.
    getCart(store.id),
  ]);

  const paths = storefrontPaths(store.slug);
  const nav: NavItem[] = [
    { href: paths.home, label: t.nav.home, exact: true },
    { href: paths.catalog, label: t.nav.catalog },
    { href: paths.contact, label: t.nav.contact },
  ];
  const updateLine = updateCartLineAction.bind(null, store.slug);

  return (
    <StorefrontUIProvider>
      <div
        lang={locale}
        style={{ "--store-accent": accent } as CSSProperties}
        className="flex flex-1 flex-col"
      >
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
              className="flex min-w-0 items-center gap-2.5 pr-2"
            >
              {store.logoUrl ? (
                <Image
                  src={store.logoUrl}
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

            <NavLinks items={nav} className="ml-4 hidden lg:block" />

            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <LanguageSwitcher locale={locale} label={t.header.language} />
              <SearchPanel
                action={paths.search}
                label={t.header.search}
                placeholder={t.search.placeholder}
                submitLabel={t.search.submit}
                closeLabel={t.cart.close}
              />
              <CartButton
                href={paths.cart}
                label={t.header.cart}
                count={cart.itemCount}
              />
            </div>
          </div>
        </header>

        {canAcceptOrders(store) ? null : (
          <p
            role="status"
            className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-center text-sm text-warning sm:px-6"
          >
            {t.banner.checkoutDisabled}
          </p>
        )}

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                {nav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <p>
              © {store.name} · {t.footer.poweredBy}{" "}
              <Link href="/" className="underline underline-offset-4">
                Tender
              </Link>
            </p>
          </div>
        </footer>

        <CartDrawer
          cart={toCartDisplay(cart, store.slug, locale)}
          t={t.cart}
          updateLine={updateLine}
          cartHref={paths.cart}
          catalogHref={paths.catalog}
        />
      </div>
    </StorefrontUIProvider>
  );
}
