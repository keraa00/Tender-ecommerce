import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { authCookieOptions, requireSupabaseConfig } from "./config";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Must be created per request — never hoisted to a module-level singleton, or
 * one user's session leaks into another's request.
 */
export async function createSupabaseServerClient() {
  const config = requireSupabaseConfig();
  const cookieStore = await cookies();
  const userAgent = (await headers()).get("user-agent");

  return createServerClient(config.url, config.anonKey, {
    cookieOptions: authCookieOptions(config),
    // Sessions are created here, server-side, so without this Supabase records
    // every one as the server's own runtime ("node") and the sessions list in
    // account settings cannot tell a phone from a laptop. Display-only: a
    // spoofed value can only mislabel the sender's own session.
    global: userAgent ? { headers: { "User-Agent": userAgent } } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. Token refresh is handled by
          // `proxy.ts`, so ignoring this is safe.
        }
      },
    },
  });
}
