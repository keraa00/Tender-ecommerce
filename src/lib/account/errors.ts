/**
 * What to tell someone when Supabase Auth turns down an account change.
 *
 * Supabase's own messages are written for developers, and passing them through
 * leaks implementation detail (SECURITY_AUDIT.md TND-14) — so known codes get
 * copy of our own and everything else gets `fallback`. The caller logs the
 * original. Codes are from https://supabase.com/docs/guides/auth/debugging/error-codes.
 */

export type AuthErrorLike = { code?: string; status?: number; message?: string };

const MESSAGES: Record<string, string> = {
  weak_password:
    "That password is too easy to guess. Try a longer one, or mix in numbers and symbols.",
  same_password: "Your new password has to be different from the current one.",
  email_exists: "That email address is already used by another account.",
  email_address_invalid: "That email address can't be used. Try another one.",
  over_email_send_rate_limit:
    "We've sent too many emails to this address recently. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
  reauthentication_needed:
    "For your security, sign out and back in, then try again.",
  session_not_found: "Your session has ended. Sign in again to continue.",
};

export const GENERIC_ACCOUNT_ERROR = "Something went wrong. Please try again.";

/** Friendly copy for a known Supabase Auth error code, or `fallback`. */
export function authErrorMessage(
  error: AuthErrorLike,
  fallback: string = GENERIC_ACCOUNT_ERROR,
): string {
  if (error.code && error.code in MESSAGES) return MESSAGES[error.code];
  if (error.status === 429) return MESSAGES.over_request_rate_limit;
  return fallback;
}

/** Whether the error is one the user caused and can fix — not worth logging. */
export function isExpectedAuthError(error: AuthErrorLike): boolean {
  return Boolean(error.code && error.code in MESSAGES) || error.status === 429;
}
