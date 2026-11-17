import { NextResponse, type NextRequest } from "next/server";

import { getAdminRouting, requestHost } from "@/lib/admin/host";
import { hostRedirectRewrite } from "@/lib/admin/host-redirect";
import { resolveRoute } from "@/lib/admin/routing";
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
  const routing = getAdminRouting();
  const route = routing
    ? resolveRoute(routing, requestHost(request.headers), request.nextUrl.pathname)
    : null;

  if (route?.kind === "redirect") {
    // Deliberately not `NextResponse.redirect()`: Next strips the origin off a
    // proxy's Location header when it matches the address the server is bound
    // to, which in development is the root host itself — the browser then
    // resolves the remainder against the host it is already on and loops.
    // `@/lib/admin/host-redirect` has the detail. The rewrite below is internal;
    // the route handler it lands on issues the redirect that crosses hosts.
    return NextResponse.rewrite(hostRedirectRewrite(request.nextUrl), {
      request,
    });
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

export const config = {
  matcher: [
    /*
     * Every path except static assets, image files and inbound webhooks.
     * Auth cookies must be refreshed on storefront routes too — a logged-in
     * buyer browsing a store should stay logged in. Webhooks and the cron
     * sweep carry no session — they are verified by signature and by bearer
     * secret — so the Supabase round trip is skipped.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks/|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};
