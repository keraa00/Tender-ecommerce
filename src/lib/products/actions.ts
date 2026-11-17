"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { storeAdminPath } from "@/lib/admin/links";
import { rootDb } from "@/lib/db/root";
import { Prisma } from "@/lib/db/types";
import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import { getAdminI18n } from "@/lib/i18n/server";
import { isUuid } from "@/lib/ids";
import { getStoreContext } from "@/lib/stores/context";
import { requireSupabaseConfig } from "@/lib/supabase/config";
import { imageRejectionReason, MAX_IMAGES_PER_UPLOAD } from "./constants";
import { parseProductForm, type ProductFieldErrors } from "./form";
import { UnrecognisedImageError, deleteProductImageObjects, uploadProductImage } from "./images";
import { getStoreProduct } from "./queries";

export type ProductFormState = {
  formError?: string;
  notice?: string;
  fieldErrors?: ProductFieldErrors & { images?: string };
};

/**
 * Submitted values are deliberately not echoed back. The form is a client
 * component driven by `useActionState`, so a failed submission re-renders it
 * without remounting and the inputs keep what the seller typed — replaying the
 * values from the server would only risk clobbering newer keystrokes.
 */

/** Which unique index a P2002 came from, so it lands on the right field. */
function uniqueConstraintField(
  error: Prisma.PrismaClientKnownRequestError,
): "slug" | "sku" | null {
  const target = error.meta?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");

  if (text.includes("slug")) return "slug";
  if (text.includes("sku")) return "sku";
  return null;
}

function fileColumn(formData: FormData, name: string): File[] {
  return formData
    .getAll(name)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

function stringColumn(formData: FormData, name: string): string[] {
  return formData.getAll(name).map((v) => (typeof v === "string" ? v : ""));
}

/**
 * The collection ids the form ticked, narrowed to ones this store owns, or null
 * when the form did not carry the picker (a store with no collections yet) —
 * in which case memberships are left exactly as they are.
 */
async function submittedCollectionIds(
  storeId: string,
  formData: FormData,
): Promise<string[] | null> {
  if (formData.get("collectionsSubmitted") === null) return null;

  const ids = [...new Set(stringColumn(formData, "collectionId").filter(isUuid))];
  if (ids.length === 0) return [];

  const owned = await rootDb.collection.findMany({
    where: { storeId, id: { in: ids } },
    select: { id: true },
  });
  return owned.map((collection) => collection.id);
}

/** The next free position at the end of each collection. */
async function nextCollectionPositions(
  db: Pick<Prisma.TransactionClient, "productOnCollection">,
  collectionIds: string[],
): Promise<Map<string, number>> {
  if (collectionIds.length === 0) return new Map();

  const rows = await db.productOnCollection.groupBy({
    by: ["collectionId"],
    where: { collectionId: { in: collectionIds } },
    _max: { position: true },
  });

  return new Map(
    rows.map((row) => [row.collectionId, (row._max.position ?? -1) + 1]),
  );
}

/**
 * Uploads every accepted file, or returns a message if one is rejected. Objects
 * already written when a later file fails are removed, so a failed save does
 * not leave the bucket holding images no row points at.
 */
async function uploadAll(
  storeId: string,
  files: File[],
  t: AdminMessages["validation"]["images"],
): Promise<{ urls: string[] } | { error: string }> {
  if (files.length > MAX_IMAGES_PER_UPLOAD) {
    return { error: format(t.tooMany, { count: MAX_IMAGES_PER_UPLOAD }) };
  }

  for (const file of files) {
    const reason = imageRejectionReason(file, t);
    if (reason) return { error: reason };
  }

  const urls: string[] = [];

  try {
    for (const file of files) {
      urls.push(await uploadProductImage(storeId, file));
    }
  } catch (error) {
    if (!(error instanceof UnrecognisedImageError)) console.error("Product image upload failed", error);
    if (urls.length > 0) {
      await deleteProductImageObjects(urls, requireSupabaseConfig().url);
    }
    return {
      error: error instanceof UnrecognisedImageError ? t.unrecognised : t.uploadFailed,
    };
  }

  return { urls };
}

export async function createProductAction(
  storeSlug: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  // Resolves the tenant from the URL slug plus the session — never from the
  // form body — and 404s a non-member before any work is done.
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);

  const parsed = parseProductForm(formData, t);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const { draft } = parsed;

  const uploaded = await uploadAll(store.id, fileColumn(formData, "imageFile"), t.validation.images);
  if ("error" in uploaded) {
    return { fieldErrors: { images: uploaded.error } };
  }

  const collectionIds = (await submittedCollectionIds(store.id, formData)) ?? [];
  // A new product joins the end of each collection, after what the seller
  // has already arranged.
  const positions = await nextCollectionPositions(rootDb, collectionIds);

  let productId: string;

  try {
    const product = await rootDb.product.create({
      data: {
        storeId: store.id,
        title: draft.title,
        slug: draft.slug,
        description: draft.description,
        status: draft.status,
        requiresShipping: draft.requiresShipping,
        variants: {
          create: draft.variants.map((variant, position) => ({
            // Variants carry the tenant key too, so a variant-level query never
            // has to join through Product to be scoped.
            storeId: store.id,
            title: variant.title,
            sku: variant.sku,
            priceCents: variant.priceCents,
            compareAtPriceCents: variant.compareAtPriceCents,
            inventoryQty: variant.inventoryQty,
            weightGrams: variant.weightGrams,
            position,
          })),
        },
        images: {
          create: uploaded.urls.map((url, position) => ({
            url,
            altText: draft.title,
            position,
          })),
        },
        collections: {
          create: collectionIds.map((collectionId) => ({
            collectionId,
            position: positions.get(collectionId) ?? 0,
          })),
        },
      },
      select: { id: true },
    });

    productId = product.id;
  } catch (error) {
    await deleteProductImageObjects(uploaded.urls, requireSupabaseConfig().url);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const field = uniqueConstraintField(error);
      if (field === "slug") {
        return { fieldErrors: { slug: t.products.errors.slugTaken } };
      }
      if (field === "sku") {
        return { fieldErrors: { variants: t.products.errors.skuTaken } };
      }
    }

    console.error("createProductAction failed", error);
    return { formError: t.products.errors.saveFailed };
  }

  // `revalidatePath` names an internal route and keeps the `/dashboard` prefix;
  // `redirect` names a URL the browser will visit, so it follows the admin host.
  // They look like the same string and are not — see `src/lib/admin/host.ts`.
  revalidatePath(`/dashboard/${storeSlug}`);
  revalidatePath(`/s/${storeSlug}`, "layout");
  // Outside the try block: redirect() signals by throwing.
  redirect(storeAdminPath(storeSlug, `products/${productId}`));
}

export async function updateProductAction(
  storeSlug: string,
  productId: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);

  const existing = await getStoreProduct(store.id, productId);
  if (!existing) notFound();

  const parsed = parseProductForm(formData, t);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const { draft } = parsed;

  // Ids are echoed back by the form, so every one is re-checked against what
  // this product actually owns before it is used in a write.
  const ownVariantIds = new Set(existing.variants.map((variant) => variant.id));
  const ownImageIds = new Set(existing.images.map((image) => image.id));

  const removeImageIds = new Set(
    stringColumn(formData, "removeImageId").filter((id) => ownImageIds.has(id)),
  );

  const keptImageIds = stringColumn(formData, "existingImageId");
  const keptImageAlts = stringColumn(formData, "existingImageAlt");

  if (
    existing.images.length > 0 &&
    removeImageIds.size === existing.images.length &&
    fileColumn(formData, "imageFile").length === 0 &&
    draft.status === "ACTIVE"
  ) {
    // Not fatal, but a live product with no photo sells badly — say so rather
    // than silently publishing an empty card.
    return {
      fieldErrors: { images: t.products.errors.keepImage },
    };
  }

  const uploaded = await uploadAll(store.id, fileColumn(formData, "imageFile"), t.validation.images);
  if ("error" in uploaded) {
    return { fieldErrors: { images: uploaded.error } };
  }

  const collectionIds = await submittedCollectionIds(store.id, formData);

  const removedUrls = existing.images
    .filter((image) => removeImageIds.has(image.id))
    .map((image) => image.url);

  try {
    await rootDb.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: existing.id },
        data: {
          title: draft.title,
          slug: draft.slug,
          description: draft.description,
          status: draft.status,
          requiresShipping: draft.requiresShipping,
        },
      });

      const keptVariantIds = new Set(
        draft.variants
          .map((variant) => variant.id)
          .filter((id): id is string => id !== null && ownVariantIds.has(id)),
      );

      const droppedVariantIds = existing.variants
        .map((variant) => variant.id)
        .filter((id) => !keptVariantIds.has(id));

      if (droppedVariantIds.length > 0) {
        // Scoped by storeId as well as id: the tenant key belongs in the
        // filter of every write, not only in the read that found the rows.
        await tx.variant.deleteMany({
          where: { id: { in: droppedVariantIds }, storeId: store.id },
        });
      }

      for (const [position, variant] of draft.variants.entries()) {
        // A row carrying an id this product does not own is treated as new
        // rather than trusted — a forged id must not reach an update.
        const existingId =
          variant.id !== null && ownVariantIds.has(variant.id)
            ? variant.id
            : null;

        if (existingId !== null) {
          await tx.variant.update({
            where: { id: existingId },
            data: {
              title: variant.title,
              sku: variant.sku,
              priceCents: variant.priceCents,
              compareAtPriceCents: variant.compareAtPriceCents,
              inventoryQty: variant.inventoryQty,
              weightGrams: variant.weightGrams,
              position,
            },
          });
        } else {
          await tx.variant.create({
            data: {
              storeId: store.id,
              productId: existing.id,
              title: variant.title,
              sku: variant.sku,
              priceCents: variant.priceCents,
              compareAtPriceCents: variant.compareAtPriceCents,
              inventoryQty: variant.inventoryQty,
              weightGrams: variant.weightGrams,
              position,
            },
          });
        }
      }

      if (removeImageIds.size > 0) {
        await tx.productImage.deleteMany({
          where: { id: { in: [...removeImageIds] }, productId: existing.id },
        });
      }

      let position = 0;
      for (const [index, imageId] of keptImageIds.entries()) {
        if (!ownImageIds.has(imageId) || removeImageIds.has(imageId)) continue;

        await tx.productImage.update({
          where: { id: imageId },
          data: {
            altText: (keptImageAlts[index] ?? "").trim() || draft.title,
            position,
          },
        });
        position += 1;
      }

      if (collectionIds !== null) {
        await tx.productOnCollection.deleteMany({
          where: {
            productId: existing.id,
            collectionId: { notIn: collectionIds },
          },
        });

        const current = new Set(
          (
            await tx.productOnCollection.findMany({
              where: { productId: existing.id },
              select: { collectionId: true },
            })
          ).map((entry) => entry.collectionId),
        );
        // Existing memberships keep their place; new ones go on the end.
        const added = collectionIds.filter((id) => !current.has(id));
        const positions = await nextCollectionPositions(tx, added);

        if (added.length > 0) {
          await tx.productOnCollection.createMany({
            data: added.map((collectionId) => ({
              productId: existing.id,
              collectionId,
              position: positions.get(collectionId) ?? 0,
            })),
          });
        }
      }

      if (uploaded.urls.length > 0) {
        await tx.productImage.createMany({
          data: uploaded.urls.map((url, offset) => ({
            productId: existing.id,
            url,
            altText: draft.title,
            position: position + offset,
          })),
        });
      }
    });
  } catch (error) {
    await deleteProductImageObjects(uploaded.urls, requireSupabaseConfig().url);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const field = uniqueConstraintField(error);
      if (field === "slug") {
        return { fieldErrors: { slug: t.products.errors.slugTaken } };
      }
      if (field === "sku") {
        return { fieldErrors: { variants: t.products.errors.skuTaken } };
      }
    }

    console.error("updateProductAction failed", error);
    return { formError: t.products.errors.saveFailed };
  }

  // Only once the transaction has committed — an object removed before a failed
  // save would leave a row pointing at nothing.
  await deleteProductImageObjects(removedUrls, requireSupabaseConfig().url);

  revalidatePath(`/dashboard/${storeSlug}`);
  revalidatePath(`/dashboard/${storeSlug}/products`);
  revalidatePath(`/dashboard/${storeSlug}/collections`);
  revalidatePath(`/s/${storeSlug}`, "layout");

  return { notice: t.products.saved };
}

export async function deleteProductAction(
  storeSlug: string,
  productId: string,
): Promise<void> {
  const { store } = await getStoreContext(storeSlug);

  const existing = await getStoreProduct(store.id, productId);
  if (!existing) notFound();

  try {
    // Scoped by storeId as well as id. Variants and images cascade.
    await rootDb.product.deleteMany({
      where: { id: existing.id, storeId: store.id },
    });
  } catch (error) {
    console.error("deleteProductAction failed", error);
    redirect(
      `${storeAdminPath(storeSlug, `products/${productId}`)}?error=delete-failed`,
    );
  }

  await deleteProductImageObjects(
    existing.images.map((image) => image.url),
    requireSupabaseConfig().url,
  );

  revalidatePath(`/dashboard/${storeSlug}`);
  revalidatePath(`/s/${storeSlug}`, "layout");
  redirect(storeAdminPath(storeSlug, "products"));
}
