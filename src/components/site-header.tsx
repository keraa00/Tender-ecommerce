import Link from "next/link";

import { signOutAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { TenderMark } from "@/components/tender-mark";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 3h3.5A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="m10 16 4-4-4-4" />
      <path d="M14 12H4" />
    </svg>
  );
}

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
              <form action={signOutAction}>
                {/* Deliberately not the shared ghost button: the red hover has
                    to beat its `hover:text-foreground`, and `cn` is a plain
                    joiner that does not resolve Tailwind conflicts. */}
                <button
                  type="submit"
                  className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:text-danger cursor-pointer"
                >
                  <SignOutIcon className="h-4 w-4" />
                  Sign out
                </button>
              </form>
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
