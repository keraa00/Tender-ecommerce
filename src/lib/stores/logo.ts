/**
 * A store's mark: its uploaded logo, or its initials when it has none.
 *
 * Dependency-free for the same reason as `lib/products/constants.ts` — the
 * create-store form, the server action and the shared `StoreMark` all read it.
 */

import { ACCEPTED_IMAGE_TYPES, type ImageMessages } from "@/lib/products/constants";

/**
 * Logos are cropped to a square of at most this many pixels in the browser
 * before upload. The largest mark on screen is 64px; 512 covers that at any
 * pixel density, and keeps the file far below the server-action body limit.
 */
export const LOGO_PIXELS = 512;

/**
 * Server Actions refuse bodies over 1MB (Next's default `bodySizeLimit`), and
 * the limit counts the whole multipart request. 1,000,000 bytes leaves room
 * for the other fields and the multipart framing.
 */
export const MAX_LOGO_BYTES = 1_000_000;

/** Human-readable reason a logo file is unusable, or null when it is fine. */
export function logoRejectionReason(
  file: { size: number; type: string },
  t: ImageMessages,
): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return t.wrongType;
  }
  if (file.size === 0) return t.empty;
  if (file.size > MAX_LOGO_BYTES) return t.logoTooLarge;
  return null;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Up to two letters for a store without a logo: the first letter of each of
 * the first two words, so "Kerim test store" is "KT" and "Rosewater" is "R".
 *
 * Taken from the store's name rather than the owner's — one seller can run
 * several stores, and they have to tell them apart. Words that open with
 * punctuation or an emoji are read from their first letter or digit; a name
 * with none falls back to its first character.
 */
export function storeInitials(name: string): string {
  const letters: string[] = [];
  for (const word of name.trim().split(/\s+/)) {
    const start = word.search(/[\p{L}\p{N}]/u);
    if (start === -1) continue;
    // A grapheme, not a code unit, so accents written as combining marks stay
    // on their letter.
    const first = segmenter.segment(word.slice(start))[Symbol.iterator]().next().value;
    if (first) letters.push(first.segment.toUpperCase());
    if (letters.length === 2) break;
  }
  if (letters.length > 0) return letters.join("");

  const first = segmenter.segment(name.trim())[Symbol.iterator]().next().value;
  return first?.segment ?? "";
}

const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#0c0a09";

/**
 * White or near-black initials, whichever reads better on the store's accent —
 * sellers pick anything from navy to butter yellow. WCAG contrast against each,
 * so the choice holds for the colours in between too. Anything that is not a
 * hex colour gets white, the better bet on the darker accents most stores use.
 */
export function markTextColor(background: string): string {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(background.trim());
  if (!match) return LIGHT_TEXT;

  const hex =
    match[1].length === 3
      ? [...match[1]].map((digit) => digit + digit).join("")
      : match[1];
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  const againstWhite = 1.05 / (luminance + 0.05);
  const againstBlack = (luminance + 0.05) / 0.05;
  return againstWhite >= againstBlack ? LIGHT_TEXT : DARK_TEXT;
}
