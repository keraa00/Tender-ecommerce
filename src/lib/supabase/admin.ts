import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requireSupabaseConfig } from "./config";

/**
 * Service-role Supabase client.
 *
 * ⚠️ This key bypasses RLS and every storage policy. It is read from a
 * non-`NEXT_PUBLIC_` variable and this module is `server-only`, so it cannot be
 * pulled into a client bundle by an accidental import.
 *
 * Authorization for anything this client touches is the caller's job:
 *
 * - Storage: `getStoreContext()` resolves the tenant from the URL slug plus the
 *   session before any write is attempted. Objects are keyed by `storeId`, so
 *   a verified `store.id` is what confines a seller to their own prefix.
 * - `auth.admin`: only ever called with the id of the signed-in user, after
 *   they have re-entered their password — deleting their own account, or
 *   setting a new password from a fresh recovery link.
 */
export function createSupabaseAdminClient() {
  const { url } = requireSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Image uploads and account " +
        "deletion need it — see README → Local setup.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
