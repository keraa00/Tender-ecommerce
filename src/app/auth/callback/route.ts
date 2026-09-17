import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { confirmEmailLink } from "@/lib/auth/confirmation";

/**
 * The path OAuth providers are pointed at, and the one older confirmation
 * emails may still name. It shares `/auth/confirm`'s implementation so that a
 * link arriving at either path resolves identically.
 */
export async function GET(request: NextRequest) {
  const result = await confirmEmailLink(request.nextUrl.searchParams);

  // Outside any try/catch: `redirect` signals by throwing.
  if (result.status === "failed") {
    redirect(`/login?error=${result.error}`);
  }

  redirect(result.next);
}
