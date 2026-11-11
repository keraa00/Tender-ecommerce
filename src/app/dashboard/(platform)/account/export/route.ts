import { accountExportFilename, buildAccountExport } from "@/lib/account/export";
import { getAccountExportData } from "@/lib/account/queries";
import { getAuthUser, getCurrentUser } from "@/lib/auth/session";

/**
 * "Download my data" on Data & privacy. A GET, so it can be a plain link with
 * `download`; another site can make a browser request it but never read the
 * answer, and the answer is never cached.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Sign in to download your data.", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const [authUser, data] = await Promise.all([getAuthUser(), getAccountExportData(user.id)]);
  const generatedAt = new Date();

  const body = buildAccountExport({
    user,
    auth: authUser
      ? {
          emailConfirmedAt: authUser.email_confirmed_at ?? null,
          lastSignInAt: authUser.last_sign_in_at ?? null,
        }
      : null,
    memberships: data.memberships,
    orders: data.orders,
    generatedAt,
  });

  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${accountExportFilename(generatedAt)}"`,
      "Cache-Control": "no-store",
    },
  });
}
