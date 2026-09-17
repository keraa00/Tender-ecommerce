/**
 * Supabase configuration is read lazily rather than validated at module load,
 * so the storefront and build still work before a Supabase project exists.
 * Auth entry points call `requireSupabaseConfig()` and fail with a useful
 * message instead of a stack trace about `undefined`.
 */

import { getAdminRouting } from "@/lib/admin/host";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
  /**
   * `Domain` for the auth cookies. Null means host-only, the browser default.
   *
   * It is set as soon as the seller admin has its own subdomain: a host-only
   * cookie written on `tender.com` is never sent to `admin.tender.com`, so
   * signing in would bounce the seller between the login page and an admin that
   * cannot see the session. All three Supabase clients — server, browser and
   * proxy — have to agree on this value, or each writes a cookie the others
   * cannot read.
   */
  cookieDomain: string | null;
};

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return {
    url,
    anonKey,
    cookieDomain: getAdminRouting()?.cookieDomain ?? null,
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function requireSupabaseConfig(): SupabaseConfig {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env — see README → Local setup.",
    );
  }

  return config;
}

/**
 * Cookie options shared by all three Supabase clients. `@supabase/ssr` merges
 * these over its own defaults, so an empty object keeps the library's
 * behaviour unchanged.
 */
export function authCookieOptions(
  config: SupabaseConfig,
): { domain?: string } {
  return config.cookieDomain ? { domain: config.cookieDomain } : {};
}
