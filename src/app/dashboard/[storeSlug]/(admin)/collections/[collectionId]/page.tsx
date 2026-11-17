import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPage, Arrow } from "@/components/admin/page-shell";
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
import { getAdminI18n } from "@/lib/i18n/server";
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
  const [{ collection }, { t }] = await Promise.all([
    loadCollection(storeSlug, collectionId),
    getAdminI18n(),
  ]);
  return {
    title: collection
      ? `${collection.title} · ${t.collections.title}`
      : t.collections.edit.fallbackTitle,
  };
}

export default async function EditCollectionPage(
  props: PageProps<"/dashboard/[storeSlug]/collections/[collectionId]">,
) {
  const { storeSlug, collectionId } = await props.params;
  const { error } = await props.searchParams;

  // `storeId` is part of the lookup, so another tenant's collection id 404s.
  const [{ store, collection }, { t: messages }] = await Promise.all([
    loadCollection(storeSlug, collectionId),
    getAdminI18n(),
  ]);
  if (!collection) notFound();
  const t = messages.collections;

  const products = await collectionProductOptions(store.id, messages.products.status);
  const action = updateCollectionAction.bind(null, storeSlug, collection.id);
  const destroy = deleteCollectionAction.bind(null, storeSlug, collection.id);

  return (
    <AdminPage
      title={collection.title}
      back={{
        href: storeAdminPath(storeSlug, "collections"),
        label: t.title,
      }}
      description={
        <Link
          href={`${storefrontUrl(storeSlug)}/collections/${collection.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted underline-offset-4 hover:underline tabular"
        >
          <span dir="ltr">/s/{storeSlug}/collections/{collection.slug}</span> <Arrow>↗</Arrow>
        </Link>
      }
    >
      {error === "delete-failed" ? (
        <div className="mb-6">
          <FormError>{t.edit.deleteFailed}</FormError>
        </div>
      ) : null}

      <CollectionForm
        action={action}
        products={products}
        submitLabel={messages.common.saveChanges}
        t={t.form}
        collection={{
          title: collection.title,
          slug: collection.slug,
          description: collection.description,
          productIds: collection.products.map((entry) => entry.productId),
        }}
      />

      <details className="mt-10 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <summary className="cursor-pointer text-sm font-medium text-danger">
          {t.edit.deleteTitle}
        </summary>
        <p className="mt-2 text-sm text-muted text-pretty">{t.edit.deleteBody}</p>
        <form action={destroy} className="mt-3">
          <Button type="submit" variant="danger" size="sm">
            {t.edit.deleteButton}
          </Button>
        </form>
      </details>
    </AdminPage>
  );
}
