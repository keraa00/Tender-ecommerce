import type { ThemeSettings } from "./document";
import { DEFAULT_THEME_FONT, themeFontStack, type ThemeFontId } from "./typography";

/**
 * What the theme's global settings put on the storefront's wrapper element:
 * the light palette, the accent, and the font stacks. See the "Storefront
 * theme settings" rules in `globals.css`.
 *
 * The storefront is always light, whatever the buyer's device prefers: only
 * the platform's own chrome follows the system's dark mode. Fonts left at the
 * platform default add nothing.
 */
export function storefrontAppearance(
  settings: ThemeSettings,
  storeAccent: string | null,
): {
  attributes: { "data-color-scheme": "light"; "data-theme-fonts"?: "" };
  /** CSS custom properties for the wrapper's `style`. */
  style: Record<string, string>;
  /** Theme fonts whose `next/font` variables the wrapper must define. */
  fonts: ThemeFontId[];
} {
  const style: Record<string, string> = {
    // The theme's accent wins, then the store's own, then the platform's.
    "--store-accent": settings.accent ?? storeAccent ?? "var(--primary)",
  };
  const attributes: { "data-color-scheme": "light"; "data-theme-fonts"?: "" } = {
    "data-color-scheme": "light",
  };

  const fonts = [settings.headingFont, settings.bodyFont];
  const customFonts = fonts.some((font) => font !== DEFAULT_THEME_FONT);
  if (customFonts) {
    attributes["data-theme-fonts"] = "";
    style["--theme-font-heading"] = themeFontStack(settings.headingFont);
    style["--theme-font-body"] = themeFontStack(settings.bodyFont);
  }

  return { attributes, style, fonts: customFonts ? fonts : [] };
}
