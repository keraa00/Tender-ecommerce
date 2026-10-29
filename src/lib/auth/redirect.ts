/** Where untrusted paths are resolved to check they stay put. Never fetched. */
const SENTINEL_ORIGIN = "http://tender.invalid";

/**
 * Only ever redirect to a path on this origin. An open redirect here would let
 * a phishing link bounce a freshly authenticated user to an attacker's page.
 *
 * The `//` check is the part that is easy to forget: `//evil.com` passes a
 * naive `startsWith("/")` test, but browsers read it as a protocol-relative
 * URL and leave the origin. `/\evil.com` is the same trick in disguise.
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
  // Browsers read `\` as `/` and drop tabs and newlines from a URL, so
  // `/\evil.com` and `/<TAB>/evil.com` are protocol-relative too. No path this
  // app links to contains either.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  // The backstop: whatever the string looks like, resolving it must not leave
  // the origin it was resolved against.
  if (new URL(value, SENTINEL_ORIGIN).origin !== SENTINEL_ORIGIN) return null;
  return value;
}
