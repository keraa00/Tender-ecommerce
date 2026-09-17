/**
 * Creates the Supabase Storage bucket that product photography is uploaded to.
 *
 *   npm run storage:setup
 *
 * Idempotent: re-running it updates the bucket's limits rather than failing, so
 * it is safe to run on every environment and after changing the limits below.
 *
 * The bucket is **public read**. `next.config.ts` allowlists exactly this
 * project's `/storage/v1/object/public/**` path for `next/image`, and a
 * storefront image that needed a signed URL could not be cached by the image
 * optimiser. Writes never go through a public path — they use the service-role
 * key from the server, after `getStoreContext()` has verified membership.
 */

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const BUCKET = "product-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const options = {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  };

  const { data: existing } = await supabase.storage.getBucket(BUCKET);

  if (existing) {
    const { error } = await supabase.storage.updateBucket(BUCKET, options);
    if (error) {
      console.error(`Could not update the "${BUCKET}" bucket:`, error.message);
      process.exit(1);
    }
    console.log(`Bucket "${BUCKET}" already existed — limits updated.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET, options);

  if (error) {
    console.error(`Could not create the "${BUCKET}" bucket:`, error.message);
    process.exit(1);
  }

  console.log(`Bucket "${BUCKET}" created (public read, ${MAX_IMAGE_BYTES} byte limit).`);
}

main();
