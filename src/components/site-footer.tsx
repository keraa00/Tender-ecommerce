import Link from "next/link";

import { TenderMark } from "@/components/tender-mark";
import { getCurrentUser } from "@/lib/auth/session";
import { SITE } from "@/lib/site";

/* Only links to pages that exist. The contact and legal links come from
   `SITE` and stay hidden until they are filled in there. "How it works" is
   rooted at `/` so it still lands on the home page from /stores. */

const LEGAL = [
  { label: "Terms", href: SITE.legal.terms },
  { label: "Privacy", href: SITE.legal.privacy },
].filter((link) => link.href);

const linkClass = "text-muted transition-colors hover:text-accent";

export async function SiteFooter() {
  const user = await getCurrentUser();

  const nav = [
    { label: "How it works", href: "/#how-it-works" },
    { label: "Stores", href: "/stores" },
    ...(user
      ? [{ label: "Dashboard", href: "/dashboard" }]
      : [
          { label: "Start selling", href: "/signup" },
          { label: "Log in", href: "/login" },
        ]),
  ];

  return (
    <footer className="border-t border-border bg-linear-to-b from-background via-home-mist to-home-sky">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <TenderMark />
              Tender
            </Link>
            <p className="mt-2 max-w-xs text-sm text-muted text-pretty">
              Online storefronts, paid straight into your own Stripe account.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:items-end">
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {nav.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
                {SITE.supportEmail && (
                  <li>
                    <a href={`mailto:${SITE.supportEmail}`} className={linkClass}>
                      Contact
                    </a>
                  </li>
                )}
              </ul>
            </nav>

            {user && (
              <p className="inline-flex max-w-full items-center gap-2 self-start rounded-full border border-border bg-surface/70 px-3 py-1 text-sm text-muted sm:self-auto">
                <span aria-hidden className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                <span className="truncate">
                  Logged in as{" "}
                  <span className="font-medium text-foreground">
                    {user.name ?? user.email}
                  </span>
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.legalName || "Tender"}
          </p>

          {LEGAL.length > 0 && (
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {LEGAL.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  );
}
