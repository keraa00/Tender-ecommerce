import "server-only";

import { randomUUID } from "node:crypto";

import { SNIFF_BYTES, UNRECOGNISED_IMAGE, sniffImageType } from "@/lib/images/sniff";
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

/**
 * The upload's content is not an accepted image, whatever type it was sent
 * as. Its message is written for the seller; callers show it as it is.
 */
export class UnrecognisedImageError extends Error {
  constructor() {
    super(UNRECOGNISED_IMAGE);
    this.name = "UnrecognisedImageError";
  }
}

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

/**
 * The type, extension and `Content-Type` of every upload come from the file's
 * own bytes (SECURITY_AUDIT.md TND-11): the bucket is public, so a file the
 * browser merely *called* an image would otherwise be hosted, and served, as
 * whatever it really is.
 */
async function uploadImage(storeId: string, name: string, file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const contentType = sniffImageType(head);
  if (!contentType) throw new UnrecognisedImageError();

  const supabase = createSupabaseAdminClient();
  const path = `${storeId}/${name}.${EXTENSIONS[contentType]}`;

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, file, { contentType, upsert: false });

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

/**
 * Removes every object under a deleted store's prefix: products, logos and
 * theme images alike. Listed from storage rather than collected from rows, so
 * files no row points at any more go too.
 *
 * Best effort, after the store's rows are gone: an object left behind costs
 * storage, not correctness. `remove()` reports success even when it removed
 * nothing, so each round lists again to see whether the prefix really emptied.
 */
export async function deleteStoreObjects(storeId: string): Promise<void> {
  try {
    const bucket = createSupabaseAdminClient().storage.from(PRODUCT_IMAGE_BUCKET);
    const attempted = new Set<string>();

    // Always offset 0: each round deletes what the last one listed.
    for (let round = 0; round < 50; round += 1) {
      const { data, error } = await bucket.list(storeId, { limit: 1000 });
      if (error) throw error;

      // Entries without an id are folders; the layout is flat, but be safe.
      const paths = (data ?? [])
        .filter((entry) => entry.id !== null)
        .map((entry) => `${storeId}/${entry.name}`);
      if (paths.length === 0) return;

      const stuck = paths.filter((path) => attempted.has(path));
      if (stuck.length > 0) {
        throw new Error(`${stuck.length} objects under ${storeId}/ would not delete`);
      }
      for (const path of paths) attempted.add(path);

      const { error: removeError } = await bucket.remove(paths);
      if (removeError) throw removeError;
    }
  } catch (error) {
    console.error("deleteStoreObjects failed", error);
  }
}
