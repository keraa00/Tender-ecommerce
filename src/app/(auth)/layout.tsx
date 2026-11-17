import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { TenderMark } from "@/components/tender-mark";

/** Nothing behind sign-in, or on the way to it, belongs in search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Typed by hand rather than with `LayoutProps`: that helper is keyed on route
// paths, and a layout inside the `(auth)` route group owns no path of its own.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-semibold tracking-tight"
        >
          <TenderMark />
          Tender
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
