import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";

/** Nothing behind sign-in, or on the way to it, belongs in search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <>
      <SiteHeader languageSwitcher />
      <main className="flex-1">{children}</main>
    </>
  );
}
