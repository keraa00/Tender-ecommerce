import { timingSafeEqual } from "node:crypto";

import { runSweep } from "@/lib/maintenance/sweep";

/**
 * The daily cleanup, called by Vercel Cron (`vercel.json`). Vercel sends
 * `Authorization: Bearer $CRON_SECRET` when the project has that variable;
 * anyone else calling gets a 401 and changes nothing.
 *
 * Forty card orders, two Stripe calls each, fit well inside a minute. A
 * backlog bigger than that is simply finished over the following days.
 */
export const maxDuration = 60;

function authorized(request: Request, secret: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("The sweep is not configured.", { status: 503 });
  if (!authorized(request, secret)) return new Response("Unauthorized.", { status: 401 });

  try {
    const result = await runSweep(new Date());
    console.log("sweep done", JSON.stringify(result));
    return Response.json(result);
  } catch (error) {
    console.error("sweep failed", error);
    return new Response("Sweep failed.", { status: 500 });
  }
}
