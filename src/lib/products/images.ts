import "server-only";

import { randomUUID } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PRODUCT_IMAGE_BUCKET, storagePathFromPublicUrl } from "./constants";

/**
 * Product photography lives in Supabase Storage rather than at a URL the seller
 * pastes in. `next.config.ts` allowlists exactly the hosts `next/image` will
 * proxy, and that list is a trust boundary — wildcarding it to accept arbitrary
 * seller input would turn the image optimiser into an open proxy.
 *
 * Objects are keyed under the store's id. The caller reaches this module only
 * with a `store.id` that `getStoreContext()` has already tied to the session,
 * so one seller cannot write into another's prefix.
 *
 * Store logos share the bucket and the prefix: same public-read rules, same
 * `next/image` allowlist entry, and one place to clean up if a store goes.
 */

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** Uploads one image and returns its public URL. */
export async function uploadProductImage(
  storeId: string,
  file: File,
): Promise<string> {
  return uploadImage(storeId, randomUUID(), file);
}

/**
 * Uploads a store's logo and returns its public URL. The name is fresh each
 * time, so a replaced logo is never served from a stale cache.
 */
export async function uploadStoreLogo(storeId: string, file: File): Promise<string> {
  return uploadImage(storeId, `logo-${randomUUID()}`, file);
}

/**
 * Uploads an image a theme section shows — a banner, an image beside text —
 * and returns its public URL. Under the store's prefix like everything else,
 * which is what `storeImageUrlPolicy` checks a theme's images against.
 */
export async function uploadThemeImage(storeId: string, file: File): Promise<string> {
  return uploadImage(storeId, `theme-${randomUUID()}`, file);
}

async function uploadImage(storeId: string, name: string, file: File): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const extension = EXTENSIONS[file.type] ?? "bin";
  const path = `${storeId}/${name}.${extension}`;

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new Error(`Image upload failed: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Best-effort removal of objects backing deleted image rows. A failure here
 * leaves an orphaned object, which is wasteful but harmless — so it must not
 * fail the seller's save, which has already been committed.
 */
export async function deleteProductImageObjects(
  publicUrls: string[],
  supabaseUrl: string,
): Promise<void> {
  const paths = publicUrls
    .map((url) => storagePathFromPublicUrl(url, supabaseUrl))
    .filter((path): path is string => path !== null);

  if (paths.length === 0) return;

  try {
    const supabase = createSupabaseAdminClient();
    await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(paths);
  } catch (error) {
    console.error("Failed to remove product image objects", error);
  }
}
