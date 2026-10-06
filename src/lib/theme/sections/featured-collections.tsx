import { CollectionCard } from "@/components/storefront/collection-card";
import { collectionCover } from "@/lib/collections/cover";
import { plural } from "@/lib/i18n/messages";
import { en } from "@/lib/i18n/messages/en";
import { defineSection } from "../define";
import { field, textOr } from "../fields";

export default defineSection({
  type: "featured-collections",
  name: "Collection list",
  description: "A grid of your collections.",
  layout: "contained",
  maxPerPage: 3,
  settings: {
    heading: field.text({
      label: "Heading",
      maxLength: 80,
      placeholder: en.home.collections,
    }),
    source: field.select({
      label: "Collections",
      options: [
        { value: "all", label: "All collections" },
        { value: "selected", label: "Choose collections" },
      ],
      default: "all",
    }),
    collectionIds: field.collectionList({
      label: "Collections to show",
      help: "Used with “Choose collections”, in this order.",
      max: 12,
    }),
  },
  async Component({ section, ctx }) {
    const { settings } = section;
    const collections = pickCollections(
      await ctx.data.collections(),
      settings.source,
      settings.collectionIds,
    );

    // Nothing to show is no section at all, rather than a heading over a gap.
    if (collections.length === 0) return null;

    const headingId = `${section.id}-heading`;

    return (
      <section aria-labelledby={headingId}>
        <h2
          id={headingId}
          className="text-xl font-semibold tracking-tight"
        >
          {textOr(settings.heading, ctx.t.home.collections)}
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              href={ctx.paths.collection(collection.slug)}
              title={collection.title}
              countLabel={plural(
                ctx.locale,
                collection._count.products,
                ctx.t.catalog.productCount,
              )}
              cover={collectionCover(collection)}
            />
          ))}
        </div>
      </section>
    );
  },
});

/**
 * Every collection, or the chosen ones in the seller's order. Ids that name
 * nothing on sale — deleted, emptied, or never this store's — drop out, since
 * the list they are looked up in is already the store's own.
 */
export function pickCollections<C extends { id: string }>(
  available: readonly C[],
  source: "all" | "selected",
  ids: readonly string[],
): C[] {
  if (source === "all") return [...available];

  const byId = new Map(available.map((collection) => [collection.id, collection]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
