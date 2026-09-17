import type { EmailOtpType } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "./redirect";

/**
 * Supabase sends email confirmation links in one of two shapes, and which one
 * lands here is decided by the project's email template — not by anything in
 * this repo:
 *
 * - `?token_hash=…&type=…`, from a template built on `{{ .TokenHash }}`.
 *   Redeemed with `verifyOtp()`. Nothing from the sign-up session is needed,
 *   so the link works from any browser or device.
 *
 * - `?code=…`, which is what the stock `{{ .ConfirmationURL }}` template ends
 *   up producing: that link points at Supabase's own `/auth/v1/verify`, which
 *   verifies the token and then bounces the browser to `emailRedirectTo` with
 *   a PKCE code attached. Redeemed with `exchangeCodeForSession()`, which
 *   needs the code-verifier cookie written at sign-up — so it only works in
 *   the browser that signed up.
 *
 * Handling both is what keeps a confirmation link working regardless of which
 * template the project has, including links already sitting in an inbox when
 * the template changes.
 */

const EMAIL_OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const satisfies readonly EmailOtpType[];

function isEmailOtpType(value: string): value is EmailOtpType {
  return (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

export type ConfirmationRequest =
  | { kind: "token-hash"; tokenHash: string; type: EmailOtpType; next: string }
  | { kind: "code"; code: string; next: string }
  | { kind: "invalid" };

/**
 * `next` rides along on the `emailRedirectTo` query string; Supabase appends
 * its own parameters to that URL rather than replacing them, so it survives
 * the round trip. It is still untrusted input by the time it gets back here.
 */
export function parseConfirmationRequest(
  searchParams: URLSearchParams,
): ConfirmationRequest {
  const next = safeRedirectPath(searchParams.get("next")) ?? "/dashboard";

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // `type` is attacker-controlled, so it is narrowed against the known set
  // rather than cast straight onto `verifyOtp`'s parameter.
  if (tokenHash && type && isEmailOtpType(type)) {
    return { kind: "token-hash", tokenHash, type, next };
  }

  const code = searchParams.get("code");
  if (code) {
    return { kind: "code", code, next };
  }

  return { kind: "invalid" };
}

/** Query keys understood by `/login`, which turns them into a message. */
export type ConfirmationErrorCode =
  | "confirmation-link-invalid"
  | "confirmation-link-expired"
  | "confirmation-link-other-browser";

/**
 * A missing PKCE verifier is not an expired link — it means the link was
 * opened somewhere other than the browser that signed up, which is ordinary
 * behaviour for email. Telling the user it expired sends them to request
 * another link that will fail the same way.
 */
export function confirmationErrorCode(error: {
  code?: string;
}): ConfirmationErrorCode {
  return error.code === "pkce_code_verifier_not_found"
    ? "confirmation-link-other-browser"
    : "confirmation-link-expired";
}

export type ConfirmationResult =
  | { status: "confirmed"; next: string }
  | { status: "failed"; error: ConfirmationErrorCode };

/** Redeems whichever link shape arrived, establishing the session cookies. */
export async function confirmEmailLink(
  searchParams: URLSearchParams,
): Promise<ConfirmationResult> {
  const request = parseConfirmationRequest(searchParams);

  if (request.kind === "invalid") {
    return { status: "failed", error: "confirmation-link-invalid" };
  }

  const supabase = await createSupabaseServerClient();

  const { error } =
    request.kind === "token-hash"
      ? await supabase.auth.verifyOtp({
          type: request.type,
          token_hash: request.tokenHash,
        })
      : await supabase.auth.exchangeCodeForSession(request.code);

  if (error) {
    return { status: "failed", error: confirmationErrorCode(error) };
  }

  return { status: "confirmed", next: request.next };
}
