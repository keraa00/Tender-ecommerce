import type { MetadataRoute } from "next";

/**
 * Storefronts, products and the platform pages are for search engines; the
 * admin, sign-in flows, carts, checkouts and search results are not. The
 * admin and auth layouts also say `noindex` themselves, for a crawler that
 * reaches them through a link rather than by this file.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/api/",
        "/auth/",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/account-deleted",
        "/s/*/cart",
        "/s/*/checkout",
        "/s/*/search",
      ],
    },
  };
}
