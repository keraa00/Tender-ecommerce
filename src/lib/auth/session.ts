import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";

import { rootDb } from "@/lib/db/root";
import { PlatformRole, Prisma, type User } from "@/lib/db/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isFreshRecovery } from "./recovery";

/**
 * Supabase Auth owns `auth.users`; Prisma owns `public.users`. The two are kept
 * in step by mirroring on read rather than by a Postgres trigger on the `auth`
 * schema — a trigger would tie our migrations to Supabase specifically and
 * break `prisma migrate` against any plain Postgres, including CI and the local
 * dev database. Every code path that needs a `User` row goes through here, so
 * read-time sync is sufficient.
 */
async function mirrorAuthUser(authUser: SupabaseUser): Promise<User | null> {
  const email = authUser.email;
  if (!email) return null;

  const metadata = authUser.user_metadata as
    | { name?: string; full_name?: string }
    | undefined;
  const name = metadata?.name ?? metadata?.full_name ?? null;

  const existing = await rootDb.user.findUnique({ where: { id: authUser.id } });

  if (existing) {
    const emailChanged = existing.email !== email;
    const nameChanged = name !== null && existing.name !== name;

    if (!emailChanged && !nameChanged) return existing;

    return rootDb.user.update({
      where: { id: existing.id },
      data: { email, ...(name !== null ? { name } : {}) },
    });
  }

  try {
    return await rootDb.user.create({
      data: { id: authUser.id, email, name },
    });
  } catch (error) {
    // Two concurrent requests for a brand-new user can both miss the read and
    // both try to insert. Whoever loses the race just reads the winner's row.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return rootDb.user.findUnique({ where: { id: authUser.id } });
    }
    throw error;
  }
}

/**
 * The signed-in Supabase Auth user, or null. Most code wants `getCurrentUser()`
 * instead; this is for the few fields only Auth has — a pending `new_email`,
 * `last_sign_in_at`, `recovery_sent_at` — which account settings shows.
 * Deduplicated per request by `cache()`, and shared with `getCurrentUser()`, so
 * reading both still costs one round trip.
 */
export const getAuthUser = cache(async (): Promise<SupabaseUser | null> => {
  // Opt any page that reads the session into dynamic rendering, *before* the
  // configuration check. Without this, a build with no Supabase keys returns
  // early, never touches cookies, and Next happily prerenders /dashboard as a
  // static redirect — then silently switches to dynamic once keys are added.
  // Rendering mode must not depend on which environment variables happen to be
  // set at build time.
  await connection();

  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();

  // `getUser()` revalidates the JWT with Supabase — and fails once the session
  // behind it is revoked, which is what makes signing out another device take
  // effect immediately. Never trust `getSession()` for authorization — it reads
  // the cookie without verifying it.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  return user;
});

/**
 * The signed-in user, or null. Deduplicated per request by `cache()`, so
 * calling it from a layout and three components costs one round trip.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const authUser = await getAuthUser();
  return authUser ? mirrorAuthUser(authUser) : null;
});

/**
 * Whether this request's session came from a password-reset link within the
 * last few minutes — the one case where a new password may be set without the
 * old one. See `isFreshRecovery()` for what that is read from.
 */
export async function hasFreshRecoverySession(): Promise<boolean> {
  const authUser = await getAuthUser();
  if (!authUser) return false;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return false;

  return isFreshRecovery({
    amr: data.claims.amr,
    recoverySentAt: authUser.recovery_sent_at,
    now: Math.floor(Date.now() / 1000),
  });
}

/** Redirects to login when signed out. Use in any authenticated route. */
export async function requireUser(returnTo?: string): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    const target = returnTo
      ? `/login?next=${encodeURIComponent(returnTo)}`
      : "/login";
    redirect(target);
  }

  return user;
}

/** Gate for `/admin/*`. */
export async function requirePlatformAdmin(returnTo?: string): Promise<User> {
  const user = await requireUser(returnTo);

  if (user.platformRole !== PlatformRole.PLATFORM_ADMIN) {
    // 404 rather than 403: a non-admin has no business learning that /admin
    // exists as a real route.
    const { notFound } = await import("next/navigation");
    notFound();
  }

  return user;
}
