import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPage } from "@/components/admin/page-shell";
import { CollectionForm } from "@/components/collections/collection-form";
import { FormError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { storeAdminPath, storefrontUrl } from "@/lib/admin/links";
import {
  deleteCollectionAction,
  updateCollectionAction,
} from "@/lib/collections/actions";
import { collectionProductOptions } from "@/lib/collections/options";
import { getStoreCollection } from "@/lib/collections/queries";
import { isUuid } from "@/lib/ids";
import { getStoreContext } from "@/lib/stores/context";

async function loadCollection(storeSlug: string, collectionId: string) {
  const { store } = await getStoreContext(storeSlug);
  if (!isUuid(collectionId)) return { store, collection: null };
  return { store, collection: await getStoreCollection(store.id, collectionId) };
}

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/collections/[collectionId]">,
): Promise<Metadata> {
  const { storeSlug, collectionId } = await props.params;
  const { collection } = await loadCollection(storeSlug, collectionId);
  return { title: collection ? `${collection.title} · Collections` : "Collection" };
}

export default async function EditCollectionPage(
  props: PageProps<"/dashboard/[storeSlug]/collections/[collectionId]">,
) {
  const { storeSlug, collectionId } = await props.params;
  const { error } = await props.searchParams;

  // `storeId` is part of the lookup, so another tenant's collection id 404s.
  const { store, collection } = await loadCollection(storeSlug, collectionId);
  if (!collection) notFound();

  const products = await collectionProductOptions(store.id);
  const action = updateCollectionAction.bind(null, storeSlug, collection.id);
  const destroy = deleteCollectionAction.bind(null, storeSlug, collection.id);

  return (
    <AdminPage
      title={collection.title}
      back={{
        href: storeAdminPath(storeSlug, "collections"),
        label: "Collections",
      }}
      description={
        <Link
          href={`${storefrontUrl(storeSlug)}/collections/${collection.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted underline-offset-4 hover:underline tabular"
        >
          /s/{storeSlug}/collections/{collection.slug} ↗
        </Link>
      }
    >
      {error === "delete-failed" ? (
        <div className="mb-6">
          <FormError>Could not delete the collection. Please try again.</FormError>
        </div>
      ) : null}

      <CollectionForm
        action={action}
        products={products}
        submitLabel="Save changes"
        collection={{
          title: collection.title,
          slug: collection.slug,
          description: collection.description,
          productIds: collection.products.map((entry) => entry.productId),
        }}
      />

      <details className="mt-10 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <summary className="cursor-pointer text-sm font-medium text-danger">
          Delete this collection
        </summary>
        <p className="mt-2 text-sm text-muted text-pretty">
          Only the grouping goes. The products stay in your catalogue and on your
          storefront.
        </p>
        <form action={destroy} className="mt-3">
          <Button type="submit" variant="danger" size="sm">
            Delete collection
          </Button>
        </form>
      </details>
    </AdminPage>
  );
}
