import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requireSupabaseConfig } from "@/lib/supabase/config";

export type PasswordCheck = "ok" | "wrong" | "rate-limited";

/**
 * Whether `password` is the account's current password — the gate in front of
 * changing the password or email and deleting the account, so that a session
 * left open on someone else's laptop is not enough to take the account over.
 *
 * Supabase can be told to want the current password on `updateUser()`, but
 * that is a dashboard setting this repo cannot see, and with it off a wrong
 * `current_password` is quietly accepted. So the check is done here instead:
 * sign in on a throwaway client that touches no cookies, then revoke the
 * session that created at once (`scope: "local"` ends that session only, not
 * the user's others).
 *
 * Every call counts against Supabase's sign-in rate limit for the server's IP
 * (SECURITY_AUDIT.md TND-07), the same as the login form.
 */
export async function verifyPassword(
  email: string,
  password: string,
): Promise<PasswordCheck> {
  const { url, anonKey } = requireSupabaseConfig();
  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.code === "over_request_rate_limit" || error.status === 429) {
      return "rate-limited";
    }
    if (error.code !== "invalid_credentials") {
      console.error("verifyPassword: unexpected sign-in error", error);
    }
    return "wrong";
  }

  if (data.session) {
    const { error: signOutError } = await client.auth.signOut({
      scope: "local",
    });
    if (signOutError) {
      console.error("verifyPassword: could not revoke the check session", signOutError);
    }
  }

  return "ok";
}
