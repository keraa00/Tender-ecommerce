import { createBrowserClient } from "@supabase/ssr";
import { authCookieOptions, requireSupabaseConfig } from "./config";

/** Supabase client for Client Components. */
export function createSupabaseBrowserClient() {
  const config = requireSupabaseConfig();

  // The domain has to match what the server writes, or a token refreshed in the
  // browser lands in a second, host-only cookie that the other host never sees.
  return createBrowserClient(config.url, config.anonKey, {
    cookieOptions: authCookieOptions(config),
  });
}
