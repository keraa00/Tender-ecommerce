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
    searchSuggestions: `${base}/search/suggestions`,
    cart: `${base}/cart`,
    checkout: `${base}/checkout`,
    /** Checkout for one item, from its own cart — see "Buy it now". */
    checkoutBuyNow: `${base}/checkout/buy-now`,
    checkoutComplete: `${base}/checkout/complete`,
    product: (productSlug: string) => `${base}/p/${productSlug}`,
    collection: (collectionSlug: string) => `${base}/collections/${collectionSlug}`,
  };
};
