import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { AdminPage, EmptyState, Rows } from "@/components/admin/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { storeAdminPath } from "@/lib/admin/links";
import { collectionCover, listStoreCollections } from "@/lib/collections/queries";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/collections">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Collections · ${store.name}` };
}

export default async function CollectionsPage(
  props: PageProps<"/dashboard/[storeSlug]/collections">,
) {
  const { storeSlug } = await props.params;
  // Membership is verified here; `store.id` is the only tenant key used below.
  const { store } = await getStoreContext(storeSlug);

  const collections = await listStoreCollections(store.id);
  const newHref = storeAdminPath(store.slug, "collections/new");

  return (
    <AdminPage
      title="Collections"
      description={
        collections.length === 0
          ? "Group products so buyers can browse by theme."
          : `${collections.length} ${collections.length === 1 ? "collection" : "collections"}.`
      }
      action={
        collections.length > 0 ? (
          <ButtonLink href={newHref} size="sm">
            New collection
          </ButtonLink>
        ) : null
      }
    >
      {collections.length === 0 ? (
        <EmptyState
          title="No collections yet"
          action={
            <ButtonLink href={newHref} size="lg">
              Create a collection
            </ButtonLink>
          }
        >
          Collections group products — “Summer”, “Gifts under $30”, “Mugs” — and
          each one gets its own page on your storefront.
        </EmptyState>
      ) : (
        <Rows>
          {collections.map((collection) => {
            const cover = collectionCover(collection);
            const count = collection._count.products;

            return (
              <li key={collection.id}>
                <Link
                  href={storeAdminPath(store.slug, `collections/${collection.id}`)}
                  className="flex items-center gap-4 bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-subtle">
                    {cover ? (
                      <Image
                        src={cover.url}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{collection.title}</p>
                    <p className="truncate text-sm text-muted tabular">
                      {count} {count === 1 ? "product" : "products"} · /collections/
                      {collection.slug}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </Rows>
      )}
    </AdminPage>
  );
}
