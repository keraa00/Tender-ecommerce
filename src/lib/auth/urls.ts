/**
 * Where an emailed link sends the user: `/auth/confirm`, carrying the path
 * they were headed for so redeeming the link lands them there. Sign-up,
 * password reset and email change all go through it.
 *
 * Always the root origin, whichever host the request came in on — Supabase
 * only redirects to URLs on its allow-list.
 */
export function confirmRedirectUrl(next: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}
