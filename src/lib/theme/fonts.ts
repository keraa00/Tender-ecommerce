import { DM_Sans, Fraunces, Inter, Lora, Playfair_Display } from "next/font/google";

import type { ThemeFontId } from "./typography";

/**
 * The theme typefaces, self-hosted through `next/font`. Each one only defines
 * a CSS variable; `./typography` holds the stacks that use them.
 *
 * Nothing is preloaded: a store uses at most two of these, and preloading
 * would make every storefront download all five. Geist is the root layout's,
 * so it is not repeated here. `next/font` reads its arguments at build time,
 * which is why each call spells them out rather than sharing a constant.
 */

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-theme-inter",
  display: "swap",
  preload: false,
});

const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-theme-dm-sans",
  display: "swap",
  preload: false,
});

const lora = Lora({
  subsets: ["latin", "latin-ext"],
  variable: "--font-theme-lora",
  display: "swap",
  preload: false,
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  variable: "--font-theme-playfair-display",
  display: "swap",
  preload: false,
});

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-theme-fraunces",
  display: "swap",
  preload: false,
});

const LOADED: Record<Exclude<ThemeFontId, "geist">, { variable: string }> = {
  inter,
  "dm-sans": dmSans,
  lora,
  "playfair-display": playfairDisplay,
  fraunces,
};

/** The class names that define the variables these fonts' stacks refer to. */
export function themeFontClassNames(ids: ThemeFontId[]): string {
  return [...new Set(ids)]
    .flatMap((id) => (id === "geist" ? [] : [LOADED[id].variable]))
    .join(" ");
}
