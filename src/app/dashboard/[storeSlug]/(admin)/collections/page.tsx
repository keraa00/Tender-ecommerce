import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { AdminPage, EmptyState, Rows } from "@/components/admin/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { storeAdminPath } from "@/lib/admin/links";
import { collectionCover, listStoreCollections } from "@/lib/collections/queries";
import { plural } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/collections">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.collections.title} · ${store.name}` };
}

export default async function CollectionsPage(
  props: PageProps<"/dashboard/[storeSlug]/collections">,
) {
  const { storeSlug } = await props.params;
  // Membership is verified here; `store.id` is the only tenant key used below.
  const [{ store }, { t: messages, locale }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const t = messages.collections;

  const collections = await listStoreCollections(store.id);
  const newHref = storeAdminPath(store.slug, "collections/new");

  return (
    <AdminPage
      title={t.title}
      description={
        collections.length === 0 ? t.empty : plural(locale, collections.length, t.count)
      }
      action={
        collections.length > 0 ? (
          <ButtonLink href={newHref} size="sm">
            {t.newCollection}
          </ButtonLink>
        ) : null
      }
    >
      {collections.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          action={
            <ButtonLink href={newHref} size="lg">
              {t.create}
            </ButtonLink>
          }
        >
          {t.emptyBody}
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
                      {plural(locale, count, t.products)} ·{" "}
                      <span dir="ltr">/collections/{collection.slug}</span>
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
