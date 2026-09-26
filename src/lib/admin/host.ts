/**
 * Where the seller admin is served from.
 *
 * The admin lives on its own `admin.` subdomain, but internally it is still the
 * `/dashboard/[storeSlug]/…` route tree — the subdomain is resolved in
 * `src/proxy.ts`, which rewrites `admin.tender.com/acme/orders` onto
 * `/dashboard/acme/orders`. Route files, `getStoreContext()` and
 * `revalidatePath()` all keep speaking the internal path, so putting the admin
 * on a subdomain did not become a rename of every route in the app.
 *
 * Nothing here is an authorization boundary. A request arriving on the admin
 * host is no more trusted than one arriving anywhere else; membership is still
 * proved by `getStoreContext()`.
 *
 * This module is imported by Client Components, so it reads only `NEXT_PUBLIC_`
 * variables (inlined into the browser bundle at build time) and pulls in no
 * server-side dependencies.
 */

/** The internal route prefix the admin host is rewritten onto. */
export const INTERNAL_ADMIN_PREFIX = "/dashboard";

export type AdminRouting = {
  /** Host and port the platform is served from: `tender.com`, `localhost:3000`. */
  rootHost: string;
  /** Host and port the seller admin is served from: `admin.tender.com`. */
  adminHost: string;
  /** `http:` or `https:`, taken from `NEXT_PUBLIC_APP_URL`. */
  protocol: string;
  /**
   * `Domain` to scope auth cookies to so one session spans both hosts, or null
   * when the two hosts do not share a parent.
   */
  cookieDomain: string | null;
};

/** `localhost:3000` → `admin.localhost:3000`; `www.tender.com` → `admin.tender.com`. */
export function deriveAdminHost(rootHost: string, label = "admin"): string {
  const [hostname, port] = splitHost(rootHost);
  const bare = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  return joinHost(`${label}.${bare}`, port);
}

/**
 * The `Domain` that makes one auth cookie readable on both hosts — the root
 * hostname, without its port, which browsers reject in a `Domain` attribute.
 *
 * Returns null unless the admin host really is a subdomain of the root host. A
 * `Domain` the current host does not own is dropped by the browser without a
 * word, which surfaces as an unexplained logout rather than as the
 * misconfiguration it is.
 *
 * Null too when the root hostname is a single label — `localhost`, or a bare
 * machine name. Those are public suffixes, and RFC 6265 §5.3 has the browser
 * *downgrade* `Domain=localhost` to a host-only cookie rather than honour it.
 * No value returned here would reach `admin.localhost`, so claiming one only
 * hides the problem: the seller signs in on the root host and then loops
 * between the login page and an admin that cannot see the session. Sharing a
 * session across the split needs a dev host with a dot in it — see
 * README → Local setup.
 */
export function sharedCookieDomain(
  rootHost: string,
  adminHost: string,
): string | null {
  const [rootName] = splitHost(rootHost);
  const [adminName] = splitHost(adminHost);

  if (adminName === rootName) return null;
  if (!rootName.includes(".")) return null;

  return adminName.endsWith(`.${rootName}`) ? rootName : null;
}

/**
 * Admin routing read from the environment, or null when it is switched off —
 * no `NEXT_PUBLIC_APP_URL`, or an explicit `NEXT_PUBLIC_ADMIN_HOST` equal to
 * the root host. Switched off, every `/dashboard/…` path keeps working exactly
 * as it did before the subdomain existed.
 */
export function getAdminRouting(): AdminRouting | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(appUrl);
  } catch {
    return null;
  }

  const rootHost = parsed.host;
  if (!rootHost) return null;

  const adminHost =
    process.env.NEXT_PUBLIC_ADMIN_HOST || deriveAdminHost(rootHost);

  if (adminHost === rootHost) return null;

  return {
    rootHost,
    adminHost,
    protocol: parsed.protocol,
    cookieDomain:
      process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN ||
      sharedCookieDomain(rootHost, adminHost),
  };
}

/** Absolute origin for one side of the split. */
export function originFor(
  routing: AdminRouting,
  host: "root" | "admin",
): string {
  const authority = host === "admin" ? routing.adminHost : routing.rootHost;
  return `${routing.protocol}//${authority}`;
}

/**
 * The host the browser actually asked for, lowercased.
 *
 * `x-forwarded-host` first: behind a reverse proxy or a platform edge, `host`
 * can be the internal origin rather than the name the browser typed.
 */
export function requestHost(headers: Headers): string {
  return (
    headers.get("x-forwarded-host") ??
    headers.get("host") ??
    ""
  ).toLowerCase();
}

export function splitHost(host: string): [hostname: string, port: string | null] {
  const colon = host.lastIndexOf(":");
  // Guard against IPv6 literals, where the colons are part of the address.
  if (colon === -1 || host.includes("]")) return [host, null];
  return [host.slice(0, colon), host.slice(colon + 1)];
}

function joinHost(hostname: string, port: string | null): string {
  return port ? `${hostname}:${port}` : hostname;
}
