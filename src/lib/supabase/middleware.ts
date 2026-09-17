import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, getSupabaseConfig } from "./config";

/** Builds the response the refreshed cookies are written onto. */
export type ResponseFactory = () => NextResponse;

/**
 * Refreshes the Supabase auth token on every request and writes the rotated
 * cookies onto the outgoing response. Without this, sessions silently expire
 * because Server Components cannot set cookies themselves.
 *
 * `makeResponse` exists because the proxy also rewrites admin-subdomain
 * requests onto their internal path. The rewrite and the cookie refresh have to
 * be the same response object, so the caller supplies the constructor rather
 * than receiving a `next()` response it would have to rebuild.
 */
export async function updateSession(
  request: NextRequest,
  makeResponse: ResponseFactory = () => NextResponse.next({ request }),
) {
  let response = makeResponse();

  const config = getSupabaseConfig();
  // No Supabase project yet — let the request through; auth pages will explain.
  if (!config) return response;

  const supabase = createServerClient(config.url, config.anonKey, {
    cookieOptions: authCookieOptions(config),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = makeResponse();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not remove: this call is what performs the refresh.
  await supabase.auth.getUser();

  return response;
}
