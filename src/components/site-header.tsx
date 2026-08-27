import Link from "next/link";

import { signOutAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { Button, ButtonLink } from "@/components/ui/button";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden
            className="grid h-6 w-6 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground"
          >
            K
          </span>
          Tender
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          {user ? (
            <>
              <ButtonLink href="/dashboard" variant="secondary" size="sm">
                Dashboard
              </ButtonLink>
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
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
        </nav>
      </div>
    </header>
  );
}
