import { NextResponse, type NextRequest } from "next/server";

import { getAdminRouting, requestHost } from "@/lib/admin/host";
import { hostRedirectTarget } from "@/lib/admin/host-redirect";

/**
 * Moves the browser between the platform host and the seller admin host.
 *
 * `src/proxy.ts` rewrites onto this route rather than redirecting itself —
 * `@/lib/admin/host-redirect` has the reason, and it is not a style preference:
 * a redirect issued from the proxy loses its origin and loops.
 *
 * The rewrite is transparent, so the request still carries the URL and `Host`
 * the browser sent. The destination is recomputed from those, through the same
 * routing table the proxy just consulted — nothing in the query is trusted, and
 * a request that arrives here on its own gets a 404 rather than a redirect
 * somewhere interesting.
 */
function hostRedirect(request: NextRequest): NextResponse {
  const routing = getAdminRouting();

  // The two hosts are one host: there is nothing to cross, and a stray request
  // learns nothing about a split that does not exist.
  if (!routing) return new NextResponse(null, { status: 404 });

  const target = hostRedirectTarget(
    routing,
    requestHost(request.headers),
    request.nextUrl,
  );
  if (!target) return new NextResponse(null, { status: 404 });

  // 307, so a Server Action POST that landed on the wrong host keeps its method
  // and body instead of silently becoming a GET.
  return NextResponse.redirect(target, 307);
}

export function GET(request: NextRequest): NextResponse {
  return hostRedirect(request);
}

export function POST(request: NextRequest): NextResponse {
  return hostRedirect(request);
}
