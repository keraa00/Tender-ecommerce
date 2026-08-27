import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next 16 renamed the `middleware` convention to `proxy`. Its only job here is
 * refreshing the Supabase auth token — it is not an authorization boundary.
 *
 * Access control lives in the route handlers and in `getStoreContext()`, where
 * it can be tested and cannot be bypassed by a request shape that happens not
 * to match a matcher pattern.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
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
