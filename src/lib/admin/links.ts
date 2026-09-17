/**
 * Every link into, out of and within the seller admin.
 *
 * Two hosts are in play, so "just write the path" is no longer safe: a
 * `/dashboard/acme/products` href rendered on the admin host resolves to
 * `admin.tender.com/dashboard/acme/products`, which is a page that does not
 * exist there. Routing these through one module means the host split is
 * decided once instead of being remembered at every `<Link>`.
 *
 * Safe to import from Client Components — see the note in `./host.ts`.
 */

import { getAdminRouting, originFor } from "@/lib/admin/host";

/** True when the seller admin is served from its own subdomain. */
export function isAdminSubdomainEnabled(): boolean {
  return getAdminRouting() !== null;
}

/**
 * A link to a page inside one store's admin, relative to whichever host that
 * admin is served from. Use this for navigation *within* the admin.
 *
 * `section` may be a whole sub-path: `products`, `products/new`,
 * `products/<id>`.
 */
export function storeAdminPath(slug: string, section?: string): string {
  const tail = section ? `/${section}` : "";
  return isAdminSubdomainEnabled()
    ? `/${slug}${tail}`
    : `/dashboard/${slug}${tail}`;
}

/**
 * The same page, absolute, for links that cross from the platform onto the
 * admin host — the store list being the one that matters. Falls back to a plain
 * path when there is no separate admin host, so the caller never has to branch.
 */
export function storeAdminUrl(slug: string, section?: string): string {
  const routing = getAdminRouting();
  const path = storeAdminPath(slug, section);
  return routing ? `${originFor(routing, "admin")}${path}` : path;
}

/** The store list, from anywhere — including from inside the admin host. */
export function allStoresUrl(): string {
  return rootUrl("/dashboard");
}

/**
 * The platform's front page. Signing out uses it, and has to: `/` on the admin
 * host is the store list, which needs a session, so a signed-out seller would
 * be handed straight back to the login form they just left.
 */
export function platformHomeUrl(): string {
  return rootUrl("/");
}

/** A public storefront, from anywhere. Storefronts live on the root host. */
export function storefrontUrl(slug: string): string {
  return rootUrl(`/s/${slug}`);
}

function rootUrl(path: string): string {
  const routing = getAdminRouting();
  return routing ? `${originFor(routing, "root")}${path}` : path;
}
