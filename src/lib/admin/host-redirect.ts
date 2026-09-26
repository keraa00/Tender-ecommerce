/**
 * Cross-host redirects, issued from a Route Handler instead of from the proxy.
 *
 * `src/proxy.ts` cannot move the browser between the two hosts with
 * `NextResponse.redirect()`. Next runs a proxy's `Location` header through
 * `getRelativeURL(location, initUrl)` — see
 * `next/dist/server/lib/router-utils/resolve-routes.js` — which strips the
 * origin whenever it matches `initUrl`. And `initUrl` is built from the
 * *server's own address*, not from the request's `Host` header, unless
 * `experimental.trustHostHeader` is set:
 *
 *     `${protocol}://${opts.hostname ?? "localhost"}:${opts.port}${req.url}`
 *
 * In development the platform's root host *is* that address, so a redirect from
 * `admin.localhost:3000/login` to `http://localhost:3000/login` went out as a
 * bare `/login`, which the browser resolved against the host it was already on.
 * Every admin → root redirect was an infinite loop, and the browser reported
 * ERR_TOO_MANY_REDIRECTS rather than anything that named the cause.
 *
 * A Route Handler's `Location` is not normalized that way, so the proxy rewrites
 * onto one and the handler issues the redirect. Both directions go through it,
 * so the path that runs in development is the path that runs in production.
 *
 * The rewrite carries nothing: Next keeps the original URL visible to the
 * handler, so it re-derives the destination from the same routing table on the
 * same request. There is no target in the query for anyone to tamper with.
 */

import { originFor, type AdminRouting } from "@/lib/admin/host";
import { resolveRoute } from "@/lib/admin/routing";

/** Where the Route Handler lives. `/api/…` is passed through on both hosts. */
export const HOST_REDIRECT_PATH = "/api/host-redirect";

/**
 * The internal URL the proxy rewrites onto — same origin as the request, so the
 * rewrite stays internal. Only the handler's response crosses hosts.
 */
export function hostRedirectRewrite(requestUrl: URL): URL {
  const rewritten = new URL(requestUrl);
  rewritten.pathname = HOST_REDIRECT_PATH;
  return rewritten;
}

/**
 * Where a request that reached the handler should be sent, or null when its own
 * host and path do not call for a redirect at all — a direct request to
 * `/api/host-redirect`, which is passed through on both hosts, lands here.
 */
export function hostRedirectTarget(
  routing: AdminRouting,
  host: string,
  requestUrl: URL,
): URL | null {
  const route = resolveRoute(routing, host, requestUrl.pathname);
  if (route?.kind !== "redirect") return null;

  const target = new URL(route.pathname, originFor(routing, route.host));
  target.search = requestUrl.search;

  return target;
}
