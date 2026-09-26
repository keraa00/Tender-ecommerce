"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { storeAdminPath } from "@/lib/admin/links";
import { rootDb } from "@/lib/db/root";
import { Prisma } from "@/lib/db/types";
import { isUuid } from "@/lib/ids";
import { getStoreContext } from "@/lib/stores/context";
import { parseCollectionForm, type CollectionFieldErrors } from "./form";
import { getStoreCollection } from "./queries";

export type CollectionFormState = {
  formError?: string;
  notice?: string;
  fieldErrors?: CollectionFieldErrors;
};

const SLUG_TAKEN = "You already have a collection at that address.";

/**
 * Keeps only the ids that name a product in this store, in the order given.
 * The ids come back from the browser, so a forged or foreign one is dropped
 * here rather than trusted into a write.
 */
async function ownProductIds(storeId: string, ids: string[]): Promise<string[]> {
  const candidates = ids.filter(isUuid);
  if (candidates.length === 0) return [];

  const owned = await rootDb.product.findMany({
    where: { storeId, id: { in: candidates } },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((product) => product.id));

  return candidates.filter((id) => ownedSet.has(id));
}

function revalidateCollectionPages(storeSlug: string) {
  // Internal route paths, not admin-host URLs — see the note in
  // `lib/products/actions.ts`.
  revalidatePath(`/dashboard/${storeSlug}/collections`);
  revalidatePath(`/dashboard/${storeSlug}/products`);
  revalidatePath(`/s/${storeSlug}`, "layout");
}

export async function createCollectionAction(
  storeSlug: string,
  _prev: CollectionFormState,
  formData: FormData,
): Promise<CollectionFormState> {
  // The tenant comes from the URL plus the session, never from the form body.
  const { store } = await getStoreContext(storeSlug);

  const parsed = parseCollectionForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const { draft } = parsed;
  const productIds = await ownProductIds(store.id, draft.productIds);

  let collectionId: string;

  try {
    const collection = await rootDb.collection.create({
      data: {
        storeId: store.id,
        title: draft.title,
        slug: draft.slug,
        description: draft.description,
        products: {
          create: productIds.map((productId, position) => ({
            productId,
            position,
          })),
        },
      },
      select: { id: true },
    });
    collectionId = collection.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { fieldErrors: { slug: SLUG_TAKEN } };
    }
    console.error("createCollectionAction failed", error);
    return { formError: "Could not save the collection. Please try again." };
  }

  revalidateCollectionPages(storeSlug);
  redirect(storeAdminPath(storeSlug, `collections/${collectionId}`));
}

export async function updateCollectionAction(
  storeSlug: string,
  collectionId: string,
  _prev: CollectionFormState,
  formData: FormData,
): Promise<CollectionFormState> {
  const { store } = await getStoreContext(storeSlug);

  if (!isUuid(collectionId)) notFound();
  const existing = await getStoreCollection(store.id, collectionId);
  if (!existing) notFound();

  const parsed = parseCollectionForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const { draft } = parsed;
  const productIds = await ownProductIds(store.id, draft.productIds);

  try {
    await rootDb.$transaction(async (tx) => {
      await tx.collection.update({
        where: { id: existing.id },
        data: {
          title: draft.title,
          slug: draft.slug,
          description: draft.description,
        },
      });

      // The form submits the whole membership in order, so replacing it is
      // both the simplest write and the one that gets positions right.
      await tx.productOnCollection.deleteMany({
        where: { collectionId: existing.id },
      });

      if (productIds.length > 0) {
        await tx.productOnCollection.createMany({
          data: productIds.map((productId, position) => ({
            collectionId: existing.id,
            productId,
            position,
          })),
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { fieldErrors: { slug: SLUG_TAKEN } };
    }
    console.error("updateCollectionAction failed", error);
    return { formError: "Could not save the collection. Please try again." };
  }

  revalidateCollectionPages(storeSlug);
  revalidatePath(`/dashboard/${storeSlug}/collections/${existing.id}`);

  return { notice: "Saved." };
}

export async function deleteCollectionAction(
  storeSlug: string,
  collectionId: string,
): Promise<void> {
  const { store } = await getStoreContext(storeSlug);

  if (!isUuid(collectionId)) notFound();

  let deleted = 0;

  try {
    // Scoped by storeId as well as id. Memberships cascade; the products
    // themselves are untouched.
    ({ count: deleted } = await rootDb.collection.deleteMany({
      where: { id: collectionId, storeId: store.id },
    }));
  } catch (error) {
    console.error("deleteCollectionAction failed", error);
    redirect(
      `${storeAdminPath(storeSlug, `collections/${collectionId}`)}?error=delete-failed`,
    );
  }

  if (deleted === 0) notFound();

  revalidateCollectionPages(storeSlug);
  redirect(storeAdminPath(storeSlug, "collections"));
}
