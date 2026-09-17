import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { confirmEmailLink } from "@/lib/auth/confirmation";

/**
 * Where `emailRedirectTo` points. Accepts both Supabase link shapes — see
 * `lib/auth/confirmation.ts` — so the route does not depend on which email
 * template the project is configured with.
 */
export async function GET(request: NextRequest) {
  const result = await confirmEmailLink(request.nextUrl.searchParams);

  // Outside any try/catch: `redirect` signals by throwing.
  if (result.status === "failed") {
    redirect(`/login?error=${result.error}`);
  }

  redirect(result.next);
}
