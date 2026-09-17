"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { rootDb } from "@/lib/db/root";
import { Prisma } from "@/lib/db/types";
import { getStoreContext } from "@/lib/stores/context";
import { requireSupabaseConfig } from "@/lib/supabase/config";
import { imageRejectionReason, MAX_IMAGES_PER_UPLOAD } from "./constants";
import { parseProductForm, type ProductFieldErrors } from "./form";
import { deleteProductImageObjects, uploadProductImage } from "./images";
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
 * Uploads every accepted file, or returns a message if one is rejected. Objects
 * already written when a later file fails are removed, so a failed save does
 * not leave the bucket holding images no row points at.
 */
async function uploadAll(
  storeId: string,
  files: File[],
): Promise<{ urls: string[] } | { error: string }> {
  if (files.length > MAX_IMAGES_PER_UPLOAD) {
    return { error: `Add at most ${MAX_IMAGES_PER_UPLOAD} images at a time.` };
  }

  for (const file of files) {
    const reason = imageRejectionReason(file);
    if (reason) return { error: reason };
  }

  const urls: string[] = [];

  try {
    for (const file of files) {
      urls.push(await uploadProductImage(storeId, file));
    }
  } catch (error) {
    console.error("Product image upload failed", error);
    if (urls.length > 0) {
      await deleteProductImageObjects(urls, requireSupabaseConfig().url);
    }
    return { error: "Could not upload those images. Please try again." };
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
  const { store } = await getStoreContext(storeSlug);

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const { draft } = parsed;

  const uploaded = await uploadAll(store.id, fileColumn(formData, "imageFile"));
  if ("error" in uploaded) {
    return { fieldErrors: { images: uploaded.error } };
  }

  let productId: string;

  try {
    const product = await rootDb.product.create({
      data: {
        storeId: store.id,
        title: draft.title,
        slug: draft.slug,
        description: draft.description,
        status: draft.status,
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
      },
      select: { id: true },
    });

    productId = product.id;
  } catch (error) {
    await deleteProductImageObjects(uploaded.urls, requireSupabaseConfig().url);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const field = uniqueConstraintField(error);
      if (field === "slug") {
        return { fieldErrors: { slug: "You already have a product at that address." } };
      }
      if (field === "sku") {
        return { fieldErrors: { variants: "One of those SKUs is already used in this store." } };
      }
    }

    console.error("createProductAction failed", error);
    return { formError: "Could not save the product. Please try again." };
  }

  revalidatePath(`/dashboard/${storeSlug}`);
  revalidatePath(`/s/${storeSlug}`);
  // Outside the try block: redirect() signals by throwing.
  redirect(`/dashboard/${storeSlug}/products/${productId}`);
}

export async function updateProductAction(
  storeSlug: string,
  productId: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { store } = await getStoreContext(storeSlug);

  const existing = await getStoreProduct(store.id, productId);
  if (!existing) notFound();

  const parsed = parseProductForm(formData);
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
      fieldErrors: { images: "Keep or add at least one image to stay published." },
    };
  }

  const uploaded = await uploadAll(store.id, fileColumn(formData, "imageFile"));
  if ("error" in uploaded) {
    return { fieldErrors: { images: uploaded.error } };
  }

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
        return { fieldErrors: { slug: "You already have a product at that address." } };
      }
      if (field === "sku") {
        return { fieldErrors: { variants: "One of those SKUs is already used in this store." } };
      }
    }

    console.error("updateProductAction failed", error);
    return { formError: "Could not save the product. Please try again." };
  }

  // Only once the transaction has committed — an object removed before a failed
  // save would leave a row pointing at nothing.
  await deleteProductImageObjects(removedUrls, requireSupabaseConfig().url);

  revalidatePath(`/dashboard/${storeSlug}`);
  revalidatePath(`/dashboard/${storeSlug}/products`);
  revalidatePath(`/s/${storeSlug}`);

  return { notice: "Saved." };
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
    redirect(`/dashboard/${storeSlug}/products/${productId}?error=delete-failed`);
  }

  await deleteProductImageObjects(
    existing.images.map((image) => image.url),
    requireSupabaseConfig().url,
  );

  revalidatePath(`/dashboard/${storeSlug}`);
  revalidatePath(`/s/${storeSlug}`);
  redirect(`/dashboard/${storeSlug}/products`);
}
