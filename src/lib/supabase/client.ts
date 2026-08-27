import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "./config";

/** Supabase client for Client Components. */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = requireSupabaseConfig();
  return createBrowserClient(url, anonKey);
}
