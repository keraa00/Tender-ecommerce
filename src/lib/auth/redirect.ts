/**
 * Only ever redirect to a path on this origin. An open redirect here would let
 * a phishing link bounce a freshly authenticated user to an attacker's page.
 *
 * The `//` check is the part that is easy to forget: `//evil.com` passes a
 * naive `startsWith("/")` test, but browsers read it as a protocol-relative
 * URL and leave the origin.
 *
 * Takes `unknown` so the same guard covers every source of untrusted input —
 * `FormData` entries and `searchParams` values (which may be arrays) alike.
 *
 * This lives outside `actions.ts` because that file is `"use server"`, where
 * every export has to be an async Server Action — a plain synchronous helper
 * cannot be exported from it.
 */
export function safeRedirectPath(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw : "";
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
