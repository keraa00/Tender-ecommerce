/**
 * Limits and rules shared by the product form, the server actions and the
 * storage layer.
 *
 * This module is deliberately dependency-free. The form is a client component,
 * and the modules either side of it are `"use server"` or `server-only` — so
 * anything both sides need has to live somewhere neither of those can drag into
 * the browser bundle.
 */

import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";

/** The refusals' wording, in the seller's language: `t.validation.images`. */
export type ImageMessages = AdminMessages["validation"]["images"];

export const PRODUCT_IMAGE_BUCKET = "product-images";

export const MAX_VARIANTS = 20;
export const MAX_IMAGES_PER_UPLOAD = 8;

/**
 * Photos are scaled down in the browser before the product form posts them,
 * because they travel inside the form's Server Action request, which is
 * capped at 4MB in `next.config.ts`. Eight at this size fit with room to
 * spare. The server checks it again: this is the limit that counts.
 */
export const MAX_IMAGE_BYTES = 450_000;

/** Longest side a product photo is scaled down to. Zoomed galleries are about this wide. */
export const PRODUCT_IMAGE_MAX_EDGE = 2_048;

/**
 * The largest file the picker takes before scaling it down — a phone photo,
 * not a print master. Checked in the browser only; nothing this size is sent.
 */
export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** `accept` attribute for the file input. */
export const IMAGE_ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");

export const MAX_SOURCE_IMAGE_MB = Math.floor(MAX_SOURCE_IMAGE_BYTES / (1024 * 1024));

/**
 * Product status is spelled out here rather than imported from `@/lib/db/types`,
 * which re-exports the generated Prisma client and would pull it into the
 * browser bundle. The values match the `ProductStatus` enum; the cast at the
 * boundary in `form.ts` is what keeps them honest. Their labels are in the
 * admin messages, under `products.status`.
 */
export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

/**
 * Human-readable reason a file the seller picked cannot be used, or null when
 * it can be scaled down and uploaded. The browser's check, before scaling.
 */
export function sourceImageRejectionReason(
  file: { size: number; type: string },
  t: ImageMessages,
): string | null {
  if (file.size === 0) return t.empty;

  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    return format(t.sourceTooLarge, { mb: MAX_SOURCE_IMAGE_MB });
  }

  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return t.wrongType;
  }

  return null;
}

/**
 * Human-readable reason an uploaded image is refused, or null when it is fine.
 * The server's check, on what the browser sent after scaling it down.
 */
export function imageRejectionReason(
  file: { size: number; type: string },
  t: ImageMessages,
): string | null {
  if (file.size === 0) return t.empty;

  if (file.size > MAX_IMAGE_BYTES) {
    return t.tooLarge;
  }

  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return t.wrongType;
  }

  return null;
}

/**
 * The object path inside the bucket for a public URL this app produced, or null
 * for anything else — a URL from another bucket, another project, or the seed
 * catalogue's remote photography, none of which we may delete.
 *
 * Pure, and kept out of the storage module so the refusals above can be tested
 * without a Supabase client.
 */
export function storagePathFromPublicUrl(
  publicUrl: string,
  supabaseUrl: string,
): string | null {
  let parsed: URL;
  let base: URL;

  try {
    parsed = new URL(publicUrl);
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }

  if (parsed.origin !== base.origin) return null;

  const prefix = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;

  const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
  return path === "" ? null : path;
}
