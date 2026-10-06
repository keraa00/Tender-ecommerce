import { ACCEPTED_IMAGE_TYPES } from "@/lib/products/constants";

/**
 * Limits for images uploaded from the theme editor. Dependency-free: the
 * editor shrinks a photo to fit before sending it, and the upload action
 * checks again.
 */

/**
 * Server Actions refuse bodies over 1MB, counting the whole multipart request,
 * so the image itself has to stay under that with room to spare.
 */
export const MAX_THEME_IMAGE_BYTES = 950_000;

/**
 * Longest side a theme image is scaled down to before upload. A full-width
 * banner on a large, dense display is about this wide; `next/image` serves
 * smaller sizes from it.
 */
export const THEME_IMAGE_MAX_EDGE = 2_400;

/** Human-readable reason an image cannot be used, or null when it can. */
export function themeImageRejectionReason(file: { size: number; type: string }): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Use a JPEG, PNG, WebP or AVIF image.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_THEME_IMAGE_BYTES) return "That image is too large. Try a smaller one.";
  return null;
}
