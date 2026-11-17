import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { AccountMenu } from "@/components/account-menu";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { TenderMark } from "@/components/tender-mark";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { setAdminLocaleAction } from "@/lib/i18n/actions";
import { getAdminI18n } from "@/lib/i18n/server";

export async function SiteHeader({
  /**
   * Pins the brand to the window's left edge instead of to the centred content
   * column. The home page uses it; the dashboard stays aligned with its own
   * content.
   */
  fullBleed = false,
  /**
   * The light/dark switch. Only the landing pages have one: it re-skins
   * `.theme-home`, which nothing else is wrapped in.
   */
  appearanceToggle = false,
  /**
   * The seller's admin language. Only the dashboard has one: the landing
   * pages are not translated, so a switcher there would change only the
   * account menu.
   */
  languageSwitcher = false,
}: {
  fullBleed?: boolean;
  appearanceToggle?: boolean;
  languageSwitcher?: boolean;
} = {}) {
  // Signed-in chrome — the Dashboard button and the account menu — speaks the
  // seller's admin language wherever it appears. The rest of the header is
  // the landing pages', which are English.
  const [user, { locale, t }] = await Promise.all([getCurrentUser(), getAdminI18n()]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div
        className={cn(
          "flex h-14 w-full items-center gap-4 px-4 sm:px-6",
          fullBleed ? "lg:px-8" : "mx-auto max-w-6xl",
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <TenderMark />
          Tender
        </Link>

        <nav className="ms-auto flex items-center gap-1 text-sm">
          {user ? (
            <>
              {languageSwitcher ? (
                <LanguageSwitcher
                  locale={locale}
                  label={t.common.language}
                  action={setAdminLocaleAction}
                  className="h-8 gap-1.5 px-2 text-sm font-medium text-muted"
                />
              ) : null}
              <ButtonLink href="/dashboard" variant="secondary" size="sm">
                {t.header.dashboard}
              </ButtonLink>
              <span className="ms-1.5 flex">
                <AccountMenu
                  name={user.name}
                  email={user.email}
                  platformAdmin={user.platformRole === "PLATFORM_ADMIN"}
                  t={t.header}
                />
              </span>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink href="/signup" variant="primary" size="sm">
                Start selling
              </ButtonLink>
            </>
          )}
          {appearanceToggle && (
            <span className="ms-1.5 flex">
              <AppearanceToggle />
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
