/**
 * Limits and rules shared by the product form, the server actions and the
 * storage layer.
 *
 * This module is deliberately dependency-free. The form is a client component,
 * and the modules either side of it are `"use server"` or `server-only` — so
 * anything both sides need has to live somewhere neither of those can drag into
 * the browser bundle.
 */

export const PRODUCT_IMAGE_BUCKET = "product-images";

export const MAX_VARIANTS = 20;
export const MAX_IMAGES_PER_UPLOAD = 8;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** `accept` attribute for the file input. */
export const IMAGE_ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");

export const MAX_IMAGE_MB = Math.floor(MAX_IMAGE_BYTES / (1024 * 1024));

/**
 * Product status is spelled out here rather than imported from `@/lib/db/types`,
 * which re-exports the generated Prisma client and would pull it into the
 * browser bundle. The values match the `ProductStatus` enum; the cast at the
 * boundary in `form.ts` is what keeps them honest.
 */
export const PRODUCT_STATUS_OPTIONS = [
  {
    value: "DRAFT",
    label: "Draft",
    hint: "Only you can see it.",
  },
  {
    value: "ACTIVE",
    label: "Published",
    hint: "Listed on your storefront.",
  },
  {
    value: "ARCHIVED",
    label: "Archived",
    hint: "Hidden, but kept on past orders.",
  },
] as const;

/** Human-readable reason a chosen file is unusable, or null when it is fine. */
export function imageRejectionReason(file: {
  size: number;
  type: string;
}): string | null {
  if (file.size === 0) return "That file is empty.";

  if (file.size > MAX_IMAGE_BYTES) {
    return `Images must be under ${MAX_IMAGE_MB}MB.`;
  }

  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Use a JPEG, PNG, WebP or AVIF image.";
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
