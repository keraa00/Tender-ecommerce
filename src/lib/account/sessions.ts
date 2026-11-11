import "server-only";

import { rootDb } from "@/lib/db/root";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The devices signed in to an account, read from and revoked in Supabase's own
 * `auth.sessions` table.
 *
 * ⚠️ That table is Supabase Auth's internal storage, not a public API — there
 * is no endpoint to list a user's sessions or end just one of them. Checked
 * against the hosted project: the `postgres` role Prisma connects as can read
 * it and delete from it, deleting a row takes its refresh tokens with it
 * (`auth.refresh_tokens.session_id` cascades), and the next `getUser()` for
 * that session's access token fails. If Supabase ever takes that access away,
 * listing degrades to an error and "Sign out of all other devices", which is
 * the public `signOut({ scope: "others" })`, still works.
 *
 * A revoked device's access token keeps verifying *locally* until it expires
 * (an hour by default): Realtime joins check the JWT that way. Pages and
 * actions do not — `getCurrentUser()` asks Supabase, which knows the session
 * is gone.
 */

export type AccountSession = {
  id: string;
  createdAt: Date;
  /** The later of the last token refresh and the last update. */
  lastActiveAt: Date;
  userAgent: string | null;
  current: boolean;
};

type SessionRow = {
  id: string;
  created_at: Date;
  last_active_at: Date;
  user_agent: string | null;
};

/**
 * The id of the session this request is signed in with — the `session_id`
 * claim of its access token.
 */
export async function currentSessionId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return typeof data.claims.session_id === "string" ? data.claims.session_id : null;
}

/**
 * Live sessions with this request's marked: this device first, then the rest
 * by most recently active.
 */
export async function listSessions(
  userId: string,
  currentId: string | null,
): Promise<AccountSession[]> {
  // `refreshed_at` is `timestamp without time zone` holding UTC, unlike the
  // other two columns — hence the `at time zone`, or it would be read as local
  // time. No IP is shown: sessions are created by this app's server, so the
  // address Supabase recorded is the server's own, not the visitor's.
  const rows = await rootDb.$queryRaw<SessionRow[]>`
    select
      id::text as id,
      created_at,
      greatest(updated_at, refreshed_at at time zone 'UTC', created_at) as last_active_at,
      user_agent
    from auth.sessions
    where user_id = ${userId}::uuid
      and (not_after is null or not_after > now())
    order by last_active_at desc
  `;

  return rows
    .map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      userAgent: row.user_agent,
      current: row.id === currentId,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/**
 * Ends one of the user's sessions. Scoped by `user_id` as well as by id, so a
 * session id posted from someone else's account matches nothing.
 */
export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  const deleted = await rootDb.$executeRaw`
    delete from auth.sessions
    where id = ${sessionId}::uuid and user_id = ${userId}::uuid
  `;
  return deleted > 0;
}
