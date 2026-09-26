/**
 * The routing table behind the `admin.` subdomain, as pure functions.
 *
 * `src/proxy.ts` and the redirect route handler are the callers. Keeping the
 * decisions here — rather than inline in the proxy — is what makes them testable
 * without constructing a `NextRequest`, and the proxy is exactly the layer where
 * an untested branch turns into a redirect loop.
 */

import { INTERNAL_ADMIN_PREFIX, type AdminRouting } from "@/lib/admin/host";
import { RESERVED_STORE_SLUGS } from "@/lib/slug";

/**
 * Dashboard pages that belong to the platform rather than to one store: the
 * store list and the create-store form. They stay on the root host — a host
 * named after one store's admin is the wrong place to stand when you do not
 * have a store yet.
 */
const PLATFORM_DASHBOARD_SEGMENTS = new Set(["", "new"]);

/**
 * Framework and API paths are served from whichever host asked for them. In
 * particular the dev server's HMR endpoints live under `/_next`, and rewriting
 * those onto `/dashboard/_next/…` breaks fast refresh on the admin host.
 */
const PASS_THROUGH_PREFIXES = ["/_next", "/api", "/favicon.ico"];

/**
 * `pass` leaves the request alone, `rewrite` serves an internal path under the
 * requested URL, and `redirect` moves the browser to the canonical host for
 * that page.
 */
export type AdminRoute =
  | { kind: "pass" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "redirect"; host: "root" | "admin"; pathname: string };

/**
 * The decision for one request, from the host it arrived on.
 *
 * Null when neither host owns that name — a preview URL, an IP, a health check.
 * Those are served as written.
 *
 * Both `src/proxy.ts` and the redirect route handler call this, on the same
 * request, and must reach the same answer: the proxy rewrites onto the handler
 * for anything that redirects, and the handler is what actually issues it.
 */
export function resolveRoute(
  routing: AdminRouting,
  host: string,
  pathname: string,
): AdminRoute | null {
  if (host === routing.adminHost.toLowerCase()) {
    return resolveAdminHostRoute(pathname);
  }
  if (host === routing.rootHost.toLowerCase()) {
    return resolveRootHostRoute(pathname);
  }
  return null;
}

/** Requests arriving on `admin.<root>`. */
export function resolveAdminHostRoute(pathname: string): AdminRoute {
  if (PASS_THROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return { kind: "pass" };
  }

  const segments = splitPath(pathname);
  const first = segments[0] ?? "";

  // An absolute `/dashboard/…` link or `redirect()` produced while on the admin
  // host. Resolve it as though it had been written admin-relative, so a missed
  // call site costs one redirect instead of a 404.
  //
  // A rewrite is deliberately *not* what comes back: serving the page here
  // would leave the same store admin readable at two URLs on this host, and the
  // drawer's own links only ever point at one of them.
  if (first === "dashboard") {
    const stripped = joinPath(segments.slice(1));
    const resolved = resolveAdminHostRoute(stripped);

    return resolved.kind === "rewrite"
      ? { kind: "redirect", host: "admin", pathname: stripped }
      : resolved;
  }

  if (PLATFORM_DASHBOARD_SEGMENTS.has(first)) {
    return {
      kind: "redirect",
      host: "root",
      pathname: joinPath(["dashboard", ...segments]),
    };
  }

  // A reserved slug can never name a store, so a request for one is a platform
  // route (`/login`, `/s/acme`, `/auth/confirm`) that wandered onto this host.
  if (RESERVED_STORE_SLUGS.has(first)) {
    return { kind: "redirect", host: "root", pathname };
  }

  return { kind: "rewrite", pathname: `${INTERNAL_ADMIN_PREFIX}${pathname}` };
}

/** Requests arriving on the root host. */
export function resolveRootHostRoute(pathname: string): AdminRoute {
  const segments = splitPath(pathname);

  if (segments[0] !== "dashboard") return { kind: "pass" };

  const rest = segments.slice(1);
  if (PLATFORM_DASHBOARD_SEGMENTS.has(rest[0] ?? "")) return { kind: "pass" };

  // Store admin has exactly one canonical home, and it is not here. Sending the
  // browser on means every existing `/dashboard/<slug>` link and every
  // `redirect()` in a Server Action keeps working untouched.
  return { kind: "redirect", host: "admin", pathname: joinPath(rest) };
}

function splitPath(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function joinPath(segments: string[]): string {
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}
