import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/appearance";

// Typed by hand rather than with `LayoutProps`: that helper is keyed on route
// paths, and a layout inside the `(marketing)` route group owns no path of its
// own.
export default async function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const appearance = parseAppearance(
    (await cookies()).get(APPEARANCE_COOKIE)?.value,
  );

  return (
    // `theme-home` re-points the colour tokens at the blue palette for these
    // pages only — see globals.css. The dashboard keeps the neutral chrome.
    // `data-appearance` is the visitor's light/dark pick; without one the
    // palette follows the system.
    // `text-foreground` re-resolves the text colour here: inherited from <body>
    // it would come from the system's tokens, not the visitor's pick.
    // `overflow-x-clip` trims the glows that hang past the edges without a
    // sideways scroll; unlike `overflow-hidden` it keeps the header sticky.
    <div
      data-appearance={appearance}
      className="theme-home relative isolate flex flex-1 flex-col overflow-x-clip bg-background text-foreground"
    >
      <SiteHeader fullBleed appearanceToggle />
      {children}
      <SiteFooter />
    </div>
  );
}
