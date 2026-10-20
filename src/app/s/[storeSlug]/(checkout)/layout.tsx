import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StoreMark } from "@/components/store-mark";
import { BagIcon } from "@/components/storefront/icons";
import { cn } from "@/lib/cn";
import { localeDirection } from "@/lib/i18n/locales";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { storefrontPaths } from "@/lib/storefront/links";
import { getStoreBySlug, getStoreContactEmail } from "@/lib/stores/queries";
import { storefrontAppearance } from "@/lib/theme/appearance";
import { themeFontClassNames } from "@/lib/theme/fonts";
import { getPublishedTheme } from "@/lib/theme/queries";

/**
 * Checkout's own chrome, as Shopify draws it: the store's mark and name, a way
 * back to the cart, and nothing else — no navigation, no search, no drawer.
 * The theme still supplies the colours and fonts, so checkout looks like the
 * store it belongs to.
 */
export default async function CheckoutLayout({
  children,
  params,
}: LayoutProps<"/s/[storeSlug]">) {
  const { storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();

  const [theme, { locale, t }, contactEmail] = await Promise.all([
    getPublishedTheme(store.id),
    getStorefrontI18n(),
    getStoreContactEmail(store.id),
  ]);
  const appearance = storefrontAppearance(theme.settings, store.accentColor);
  const paths = storefrontPaths(store.slug);

  return (
    <div
      lang={locale}
      dir={localeDirection(locale)}
      style={appearance.style as CSSProperties}
      className={cn("flex flex-1 flex-col", themeFontClassNames(appearance.fonts))}
      {...appearance.attributes}
    >
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={paths.home} className="flex min-w-0 items-center gap-3">
            <StoreMark
              name={store.name}
              logoUrl={store.logoUrl}
              accentColor={store.accentColor}
              size="md"
            />
            <span className="truncate text-lg font-semibold tracking-tight">{store.name}</span>
          </Link>
          <Link
            href={paths.cart}
            aria-label={t.checkout.backToCart}
            title={t.checkout.backToCart}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors hover:bg-surface-hover"
            style={{ color: "var(--store-accent)" }}
          >
            <BagIcon className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted sm:px-6">
          {contactEmail ? (
            <p>
              {t.checkout.questions}{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {contactEmail}
              </a>
            </p>
          ) : null}
          <p>
            {t.footer.poweredBy}{" "}
            <Link href="/" className="underline underline-offset-4 hover:text-foreground">
              Tender
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
