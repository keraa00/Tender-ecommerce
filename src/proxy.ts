import { NextResponse, type NextRequest } from "next/server";

import { getAdminRouting, originFor } from "@/lib/admin/host";
import {
  resolveAdminHostRoute,
  resolveRootHostRoute,
  type AdminRoute,
} from "@/lib/admin/routing";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next 16 renamed the `middleware` convention to `proxy`. It has two jobs here:
 * refreshing the Supabase auth token, and putting each request on the host that
 * owns it — the seller admin on `admin.<root>`, everything else on the root
 * host.
 *
 * Neither job is an authorization boundary. Access control lives in the route
 * handlers and in `getStoreContext()`, where it can be tested and cannot be
 * bypassed by a request shape that happens not to match a matcher pattern. A
 * request on the admin host has proved nothing except which URL it typed.
 */
export async function proxy(request: NextRequest) {
  const route = resolveRoute(request);

  if (route?.kind === "redirect") {
    const routing = getAdminRouting();
    if (routing) {
      const target = new URL(route.pathname, originFor(routing, route.host));
      target.search = request.nextUrl.search;
      // 307, so a Server Action POST that lands on the wrong host keeps its
      // method and body instead of silently becoming a GET.
      return NextResponse.redirect(target, 307);
    }
  }

  // The rewrite has to be the *response* the Supabase client writes its
  // refreshed cookies onto, not a second response built afterwards — otherwise
  // every request on the admin host drops its rotated auth token.
  const makeResponse =
    route?.kind === "rewrite"
      ? () => {
          const url = request.nextUrl.clone();
          url.pathname = route.pathname;
          return NextResponse.rewrite(url, { request });
        }
      : () => NextResponse.next({ request });

  return updateSession(request, makeResponse);
}

function resolveRoute(request: NextRequest): AdminRoute | null {
  const routing = getAdminRouting();
  if (!routing) return null;

  // `x-forwarded-host` first: behind a reverse proxy or a platform edge, `host`
  // can be the internal origin rather than the name the browser asked for.
  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    ""
  ).toLowerCase();

  const { pathname } = request.nextUrl;

  if (host === routing.adminHost.toLowerCase()) {
    return resolveAdminHostRoute(pathname);
  }
  if (host === routing.rootHost.toLowerCase()) {
    return resolveRootHostRoute(pathname);
  }

  // Some other host — a preview URL, an IP, a health check. Leave it alone and
  // serve the paths as written.
  return null;
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image files. Auth cookies must be
     * refreshed on storefront routes too — a logged-in buyer browsing a store
     * should stay logged in.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};
