/**
 * The typefaces a theme can choose from, as data: ids, names and CSS font
 * stacks. The fonts themselves are loaded by `./fonts`, which only the
 * storefront imports — this list also travels to the settings form, and
 * `next/font` has no business in the browser bundle or the unit tests.
 *
 * A short, curated list rather than all of Google Fonts: each one is a
 * self-hosted download the storefront may need, and these are chosen to read
 * well at both heading and body sizes. Each stack ends in a generic family of
 * the same kind, which is also what scripts the font does not cover (Arabic,
 * Japanese, Chinese) fall back to.
 */

export const THEME_FONTS = [
  {
    value: "geist",
    label: "Geist",
    stack: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
  {
    value: "inter",
    label: "Inter",
    stack: "var(--font-theme-inter), ui-sans-serif, system-ui, sans-serif",
  },
  {
    value: "dm-sans",
    label: "DM Sans",
    stack: "var(--font-theme-dm-sans), ui-sans-serif, system-ui, sans-serif",
  },
  {
    value: "lora",
    label: "Lora",
    stack: "var(--font-theme-lora), ui-serif, Georgia, serif",
  },
  {
    value: "playfair-display",
    label: "Playfair Display",
    stack: "var(--font-theme-playfair-display), ui-serif, Georgia, serif",
  },
  {
    value: "fraunces",
    label: "Fraunces",
    stack: "var(--font-theme-fraunces), ui-serif, Georgia, serif",
  },
] as const;

export type ThemeFontId = (typeof THEME_FONTS)[number]["value"];

/** What the platform has always used, loaded by the root layout. */
export const DEFAULT_THEME_FONT: ThemeFontId = "geist";

export function themeFontStack(id: ThemeFontId): string {
  return (THEME_FONTS.find((font) => font.value === id) ?? THEME_FONTS[0]).stack;
}
