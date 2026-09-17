import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/* Placeholder copy. Nothing here is wired to real routes or real data yet —
   swap the `#` hrefs out as the pages land. */

const NAV: Array<{ heading: string; links: Array<{ label: string; href: string }> }> = [
  {
    heading: "Product",
    links: [
      { label: "Storefronts", href: "#" },
      { label: "Catalogue", href: "#" },
      { label: "Checkout", href: "#" },
      { label: "Pricing", href: "#" },
    ],
  },
  {
    heading: "Sellers",
    links: [
      { label: "Start selling", href: "/signup" },
      { label: "Log in", href: "/login" },
      { label: "Seller handbook", href: "#" },
      { label: "Payouts & fees", href: "#" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Changelog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
];

const CONTACT = [
  { icon: MailIcon, label: "hello@tender.shop", href: "mailto:hello@tender.shop" },
  { icon: PhoneIcon, label: "+387 33 000 000", href: "tel:+38733000000" },
  { icon: PinIcon, label: "Ferhadija 12, Sarajevo", href: null },
];

const SOCIALS = [
  { label: "X", href: "#", icon: XIcon },
  { label: "Instagram", href: "#", icon: InstagramIcon },
  { label: "LinkedIn", href: "#", icon: LinkedInIcon },
];

const LEGAL = [
  { label: "Terms", href: "#" },
  { label: "Privacy", href: "#" },
  { label: "Cookies", href: "#" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-linear-to-b from-background via-home-mist to-home-sky">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <span
                aria-hidden
                className="grid h-6 w-6 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground"
              >
                T
              </span>
              Tender
            </Link>

            <p className="mt-3 max-w-xs text-sm text-muted text-pretty">
              Isolated storefronts, your own catalogue and your own Stripe
              account. We take 5% at the charge — nothing else.
            </p>

            <ul className="mt-5 space-y-2 text-sm text-muted">
              {CONTACT.map(({ icon: Icon, label, href }) => (
                <li key={label} className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-accent" />
                  {href ? (
                    <a
                      href={href}
                      className="transition-colors hover:text-foreground"
                    >
                      {label}
                    </a>
                  ) : (
                    <span>{label}</span>
                  )}
                </li>
              ))}
            </ul>

            <ul className="mt-5 flex items-center gap-2">
              {SOCIALS.map(({ label, href, icon: Icon }) => (
                <li key={label}>
                  <Link
                    href={href}
                    aria-label={label}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface/70 text-muted transition-colors hover:border-border-strong hover:bg-surface hover:text-accent"
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {NAV.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-xs font-semibold tracking-wide text-foreground uppercase">
                {column.heading}
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-muted transition-colors hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Tender Commerce d.o.o. All rights reserved.</p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full bg-success"
              />
              All systems operational
            </span>
            {LEGAL.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="transition-colors hover:text-accent"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* --------------------------------------------------------------------------
   Icons. Inline rather than a dependency — there are six of them.
   -------------------------------------------------------------------------- */

type IconProps = { className?: string };

function Glyph({ children, ...props }: ComponentProps<"svg"> & { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

function MailIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3.5 7 7.3 5.2a2 2 0 0 0 2.4 0L20.5 7" />
    </Glyph>
  );
}

function PhoneIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M8.4 3.5H5.2A1.7 1.7 0 0 0 3.5 5.3c0 8.4 6.8 15.2 15.2 15.2a1.7 1.7 0 0 0 1.8-1.7v-3.2l-4-1.4-1.9 2.2a13.4 13.4 0 0 1-6.2-6.2L10.8 8Z" />
    </Glyph>
  );
}

function PinIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12 21.5c4-4.2 6-7.5 6-10a6 6 0 1 0-12 0c0 2.5 2 5.8 6 10Z" />
      <circle cx="12" cy="11" r="2.4" />
    </Glyph>
  );
}

function XIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="m4 4 7.2 9.1L4.4 20" />
      <path d="M10.5 12.6 20 20l-7.2-9.1" />
      <path d="M12.8 10.9 19.6 4" />
    </Glyph>
  );
}

function InstagramIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17" cy="7" r="0.6" fill="currentColor" />
    </Glyph>
  );
}

function LinkedInIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <circle cx="8" cy="8.3" r="0.9" fill="currentColor" />
      <path d="M8 11.2v5.6" />
      <path d="M11.6 16.8v-5.6m0 1.8a2.4 2.4 0 0 1 4.8 0v3.8" />
    </Glyph>
  );
}
