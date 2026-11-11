/**
 * Whether a session came from a password-reset link moments ago, and so may
 * set a new password without giving the old one.
 *
 * Everywhere else changing the password wants the current one
 * (`verifyPassword`), so `/reset-password` must not become the way round that
 * for an ordinary session left open on a shared computer. Supabase gives no
 * flag for "this is a recovery session"; what it does give, checked against the
 * hosted project:
 *
 * - redeeming a recovery link records `{ method: "otp", timestamp }` in the
 *   JWT's `amr` claim — a password sign-in records `"password"` instead —
 *   and refreshing the token keeps that entry and its timestamp unchanged;
 * - the user's `recovery_sent_at` is when the latest reset email was sent.
 *
 * So: an `otp` sign-in, no earlier than the latest reset email, within the
 * last `RECOVERY_WINDOW_SECONDS`. Every other way to an `otp` sign-in — a
 * signup or email-change link — also takes a link out of the user's inbox,
 * which is the very proof a reset link stands for; a session that only knows
 * the cookie has none of them.
 */

export const RECOVERY_WINDOW_SECONDS = 15 * 60;

export type AmrClaim = readonly ({ method: string; timestamp: number } | string)[];

export function isFreshRecovery({
  amr,
  recoverySentAt,
  now,
}: {
  amr: AmrClaim | undefined;
  /** The user's `recovery_sent_at`, as Supabase returns it. */
  recoverySentAt: string | null | undefined;
  /** Seconds since the epoch. */
  now: number;
}): boolean {
  if (!amr || !recoverySentAt) return false;

  const sentAt = Date.parse(recoverySentAt);
  if (Number.isNaN(sentAt)) return false;
  // `recovery_sent_at` has microseconds; the AMR timestamp is whole seconds and
  // is never earlier than the email that led to it.
  const sentAtSeconds = Math.floor(sentAt / 1000);

  return amr.some(
    (entry) =>
      typeof entry === "object" &&
      entry.method === "otp" &&
      entry.timestamp >= sentAtSeconds &&
      now - entry.timestamp <= RECOVERY_WINDOW_SECONDS &&
      entry.timestamp <= now + 60,
  );
}
