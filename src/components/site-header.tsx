import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { AccountMenu } from "@/components/account-menu";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { TenderMark } from "@/components/tender-mark";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

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
}: {
  fullBleed?: boolean;
  appearanceToggle?: boolean;
} = {}) {
  const user = await getCurrentUser();

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

        <nav className="ml-auto flex items-center gap-1 text-sm">
          {user ? (
            <>
              <ButtonLink href="/dashboard" variant="secondary" size="sm">
                Dashboard
              </ButtonLink>
              <span className="ml-1.5 flex">
                <AccountMenu name={user.name} email={user.email} />
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
            <span className="ml-1.5 flex">
              <AppearanceToggle />
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
