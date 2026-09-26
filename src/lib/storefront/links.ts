/**
 * Every storefront URL, in one place. Storefronts live on the root host at
 * `/s/<slug>`, so these are plain paths.
 */
export const storefrontPaths = (slug: string) => {
  const base = `/s/${slug}`;
  return {
    home: base,
    catalog: `${base}/catalog`,
    contact: `${base}/contact`,
    search: `${base}/search`,
    cart: `${base}/cart`,
    product: (productSlug: string) => `${base}/p/${productSlug}`,
    collection: (collectionSlug: string) => `${base}/collections/${collectionSlug}`,
  };
};
