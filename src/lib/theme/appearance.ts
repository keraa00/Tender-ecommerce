import type { ThemeSettings } from "./document";
import { DEFAULT_THEME_FONT, themeFontStack, type ThemeFontId } from "./typography";

/**
 * What the theme's global settings put on the storefront's wrapper element:
 * the accent, a forced colour scheme, and the font stacks. See the
 * "Storefront theme settings" rules in `globals.css`.
 *
 * Settings left at the platform default add nothing at all, so a store that
 * never touched its theme renders byte for byte as it did before themes.
 */
export function storefrontAppearance(
  settings: ThemeSettings,
  storeAccent: string | null,
): {
  attributes: { "data-color-scheme"?: "light" | "dark"; "data-theme-fonts"?: "" };
  /** CSS custom properties for the wrapper's `style`. */
  style: Record<string, string>;
  /** Theme fonts whose `next/font` variables the wrapper must define. */
  fonts: ThemeFontId[];
} {
  const style: Record<string, string> = {
    // The theme's accent wins, then the store's own, then the platform's.
    "--store-accent": settings.accent ?? storeAccent ?? "var(--primary)",
  };
  const attributes: { "data-color-scheme"?: "light" | "dark"; "data-theme-fonts"?: "" } = {};

  if (settings.colorScheme !== "auto") {
    attributes["data-color-scheme"] = settings.colorScheme;
  }

  const fonts = [settings.headingFont, settings.bodyFont];
  const customFonts = fonts.some((font) => font !== DEFAULT_THEME_FONT);
  if (customFonts) {
    attributes["data-theme-fonts"] = "";
    style["--theme-font-heading"] = themeFontStack(settings.headingFont);
    style["--theme-font-body"] = themeFontStack(settings.bodyFont);
  }

  return { attributes, style, fonts: customFonts ? fonts : [] };
}
