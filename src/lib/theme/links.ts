import type { StorefrontContext } from "./define";
import type { ThemeLink } from "./fields";

/**
 * Where a theme link goes, given the store's paths and the collections it can
 * name. A collection that is gone, or has nothing on sale and so has no page
 * worth landing on, sends the buyer to the catalogue instead of a dead end.
 */
export function linkHref(
  link: ThemeLink,
  paths: StorefrontContext["paths"],
  collections: readonly { id: string; slug: string }[],
): string {
  switch (link.kind) {
    case "home":
      return paths.home;
    case "catalog":
      return paths.catalog;
    case "contact":
      return paths.contact;
    case "collection": {
      const collection = collections.find((entry) => entry.id === link.collectionId);
      return collection ? paths.collection(collection.slug) : paths.catalog;
    }
    case "url":
      return link.url;
  }
}

/** `linkHref`, fetching the collections only when the link names one. */
export async function resolveLinkHref(
  link: ThemeLink,
  ctx: StorefrontContext,
): Promise<string> {
  const collections = link.kind === "collection" ? await ctx.data.collections() : [];
  return linkHref(link, ctx.paths, collections);
}
